// SmartPark IoT - ESP32-S2 no Wokwi (versao completa com backend)
// Bibliotecas: ESP32Servo, LiquidCrystal I2C, ArduinoJson

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>

// ============================================================
//  SUBSTITUA APENAS ESTAS DUAS LINHAS
// ============================================================
const char* BACKEND_URL = "https://scowling-slightly-canning.ngrok-free.dev";   // sem barra no final
const char* DEVICE_SHARED_SECRET = "COLOQUE_O_SEGREDO_DO_DISPOSITIVO";
// ============================================================

// ===================== REDE (Wokwi) =====================
const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";
const int   WIFI_CANAL = 6;

// ===================== PINOS (ESP32-S2) =====================
const int PIN_TRIG_ENTRADA = 4;
const int PIN_ECHO_ENTRADA = 5;
const int PIN_TRIG_SAIDA = 6;
const int PIN_ECHO_SAIDA = 7;
const int PIN_I2C_SDA = 8;
const int PIN_I2C_SCL = 9;
const int PIN_SERVO = 10;
const int PIN_LED_VERDE = 11;
const int PIN_LED_VERMELHO = 12;
const int PIN_BTN_ENTRADA = 33;
const int PIN_BTN_SAIDA = 34;
const int PIN_BTN_MANUT = 35;

// ===================== CONFIGURACAO =====================
const char* DEVICE_ID = "esp32-portao-01";
const char* FIRMWARE_VERSION = "1.0.0";

const int SERVO_FECHADO = 0;
const int SERVO_ABERTO = 90;

const float DIST_PRESENCA_CM = 20.0;
const float DIST_LIVRE_CM = 30.0;

const unsigned long TEMPO_MOCK_MS = 1200;   // latencia simulada (modo mock)
const unsigned long TEMPO_ABERTA_MS = 5000;
const unsigned long TEMPO_NEGADO_MS = 2500;
const unsigned long TEMPO_FALHA_MS = 4000;
const unsigned long INTERVALO_SENSOR_MS = 100;
const unsigned long INTERVALO_TELEMETRIA = 30000;
const unsigned long INTERVALO_RECONEXAO = 15000;
const int HTTP_CONNECT_TIMEOUT_MS = 3000;
const int HTTP_TIMEOUT_MS = 5000;

// ===================== TIPOS =====================
enum Estado { INICIALIZANDO, PRONTO, VALIDANDO, ACESSO_LIBERADO,
              ACESSO_NEGADO, FALHA_REDE, MANUTENCAO };
enum TipoEvento { ENTRADA, SAIDA };
enum Resultado { AUTORIZADO, NEGADO, SEM_RESPOSTA };

struct Botao {
  int pin;
  bool ultimo;
  unsigned long t;
};

struct Sensor {
  int trig;
  int echo;
  bool armado;
  int contagem;
};

// ===================== VARIAVEIS GLOBAIS =====================
LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo cancela;

Botao btnEntrada = {PIN_BTN_ENTRADA, false, 0};
Botao btnSaida   = {PIN_BTN_SAIDA,   false, 0};
Botao btnManut   = {PIN_BTN_MANUT,   false, 0};

Sensor sensorEntrada = {PIN_TRIG_ENTRADA, PIN_ECHO_ENTRADA, true, 0};
Sensor sensorSaida   = {PIN_TRIG_SAIDA,   PIN_ECHO_SAIDA,   true, 0};

Estado estado = INICIALIZANDO;
unsigned long tEstado = 0;
unsigned long ultimaLeituraSensor = 0;
unsigned long ultimaTelemetria = 0;
unsigned long ultimaTentativaWifi = 0;

TipoEvento tipoAtual = ENTRADA;
String eventIdAtual = "";
Resultado resultadoAtual = SEM_RESPOSTA;
uint32_t contadorEventos = 0;

String codigoReserva = "";             // definido pelo Serial: r:ABC123
Resultado mockResultado = AUTORIZADO;  // usado so no modo mock

// ===================== UTILITARIOS =====================
bool backendConfigurado() {
  return strstr(BACKEND_URL, "SEU-ENDERECO") == nullptr &&
         strstr(DEVICE_SHARED_SECRET, "COLOQUE") == nullptr;
}

void lcdMsg(const String &linha1, const String &linha2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(linha1);
  lcd.setCursor(0, 1);
  lcd.print(linha2);
}

bool pressionou(Botao &b) {
  bool lido = (digitalRead(b.pin) == LOW);
  bool evento = (lido && !b.ultimo && (millis() - b.t > 200));
  if (evento) b.t = millis();
  b.ultimo = lido;
  return evento;
}

float lerDistanciaCm(int trig, int echo) {
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long duracao = pulseIn(echo, HIGH, 25000);
  if (duracao == 0) return -1;
  return duracao * 0.0343 / 2.0;
}

bool detectou(Sensor &s) {
  float d = lerDistanciaCm(s.trig, s.echo);
  bool perto = (d > 0 && d < DIST_PRESENCA_CM);
  bool livre = (d < 0 || d > DIST_LIVRE_CM);

  if (livre) {
    s.armado = true;
    s.contagem = 0;
    return false;
  }
  if (perto && s.armado) {
    s.contagem++;
    if (s.contagem >= 3) {
      s.armado = false;
      s.contagem = 0;
      return true;
    }
  } else if (!perto) {
    s.contagem = 0;
  }
  return false;
}

String gerarEventId() {
  contadorEventos++;
  return String(DEVICE_ID) + "-" + String((uint32_t)esp_random(), HEX) +
         "-" + String(contadorEventos);
}

const char* nomeEstado(Estado e) {
  switch (e) {
    case INICIALIZANDO:   return "INICIALIZANDO";
    case PRONTO:          return "PRONTO";
    case VALIDANDO:       return "VALIDANDO";
    case ACESSO_LIBERADO: return "ACESSO_LIBERADO";
    case ACESSO_NEGADO:   return "ACESSO_NEGADO";
    case FALHA_REDE:      return "FALHA_REDE";
    case MANUTENCAO:      return "MANUTENCAO";
  }
  return "?";
}

// ===================== REDE =====================
void conectarWifi(unsigned long limiteMs) {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS, WIFI_CANAL);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < limiteMs) {
    delay(250);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi conectado. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi nao conectou (vai tentar de novo no loop)");
  }
}

void manterWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - ultimaTentativaWifi < INTERVALO_RECONEXAO) return;
  ultimaTentativaWifi = millis();
  Serial.println("WiFi desconectado. Tentando reconectar...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASS, WIFI_CANAL);
}

// Retorna o codigo HTTP (>0) ou -1 em caso de falha de conexao/rede
int postJson(const String &caminho, const String &corpo, String &resposta) {
  if (WiFi.status() != WL_CONNECTED) return -1;

  String url = String(BACKEND_URL) + caminho;
  HTTPClient http;
  WiFiClientSecure clienteSeguro;
  WiFiClient clientePlano;

  bool iniciou;
  if (url.startsWith("https")) {
    clienteSeguro.setInsecure();  // somente desenvolvimento (tunel). Em producao, validar certificado.
    iniciou = http.begin(clienteSeguro, url);
  } else {
    iniciou = http.begin(clientePlano, url);
  }
  if (!iniciou) return -1;

  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Secret", DEVICE_SHARED_SECRET);
  http.addHeader("X-Device-Id", DEVICE_ID);
  http.addHeader("ngrok-skip-browser-warning", "1");

  int codigo = http.POST(corpo);
  if (codigo <= 0) {
  Serial.print("Erro HTTP: ");
  Serial.println(HTTPClient::errorToString(codigo));
  }
  if (codigo > 0) resposta = http.getString();
  http.end();
  return codigo;
}

// ===================== VALIDACAO DE ACESSO =====================
Resultado validarAcessoMock(TipoEvento tipo, const String &eventId) {
  Serial.println("--- MODO SIMULADO (backend nao configurado) ---");
  Serial.print("event_id: ");  Serial.println(eventId);
  Serial.print("type: ");      Serial.println(tipo == ENTRADA ? "ENTRY" : "EXIT");
  delay(TEMPO_MOCK_MS);
  return mockResultado;
}

Resultado validarAcessoBackend(TipoEvento tipo, const String &eventId) {
  JsonDocument req;
  req["event_id"]         = eventId;
  req["device_id"]        = DEVICE_ID;
  req["type"]             = (tipo == ENTRADA) ? "ENTRY" : "EXIT";
  req["reservation_code"] = codigoReserva;

  String corpo;
  serializeJson(req, corpo);

  String resposta;
  int codigo = postJson("/api/iot/access-request", corpo, resposta);

  Serial.print("HTTP access-request: ");
  Serial.println(codigo);

  // Sem resposta valida do backend: nunca libera
  if (codigo <= 0 || codigo >= 500) return SEM_RESPOSTA;
  // Erros do cliente (401, 403, 404, 409...): acesso negado
  if (codigo < 200 || codigo >= 300) return NEGADO;

  JsonDocument res;
  DeserializationError erro = deserializeJson(res, resposta);
  if (erro) {
    Serial.println("Resposta JSON invalida");
    return SEM_RESPOSTA;
  }

  bool permitido = res["allowed"] | false;
  const char* motivo = res["reason"] | "";
  Serial.print("allowed: ");  Serial.println(permitido ? "true" : "false");
  if (strlen(motivo) > 0) {
    Serial.print("reason: ");
    Serial.println(motivo);
  }
  return permitido ? AUTORIZADO : NEGADO;
}

Resultado validarAcesso(TipoEvento tipo, const String &eventId) {
  if (!backendConfigurado()) return validarAcessoMock(tipo, eventId);
  return validarAcessoBackend(tipo, eventId);
}

// ===================== TELEMETRIA =====================
void enviarTelemetria() {
  if (!backendConfigurado() || WiFi.status() != WL_CONNECTED) return;

  JsonDocument doc;
  doc["device_id"]        = DEVICE_ID;
  doc["state"]            = nomeEstado(estado);
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["rssi"]             = WiFi.RSSI();
  doc["uptime_s"]         = millis() / 1000;

  String corpo, resposta;
  serializeJson(doc, corpo);
  int codigo = postJson("/api/iot/telemetry", corpo, resposta);
  Serial.print("HTTP telemetry: ");
  Serial.println(codigo);
}

// ===================== MAQUINA DE ESTADOS =====================
void entrarEstado(Estado novo) {
  estado = novo;
  tEstado = millis();
  Serial.print("[ESTADO] ");
  Serial.println(nomeEstado(novo));

  switch (novo) {
    case INICIALIZANDO:
      digitalWrite(PIN_LED_VERDE, LOW);
      digitalWrite(PIN_LED_VERMELHO, LOW);
      cancela.write(SERVO_FECHADO);
      lcdMsg("SmartPark IoT", "Iniciando...");
      break;

    case PRONTO:
      cancela.write(SERVO_FECHADO);
      digitalWrite(PIN_LED_VERDE, LOW);
      digitalWrite(PIN_LED_VERMELHO, LOW);
      lcdMsg("SmartPark PRONTO", "Aguardando...");
      break;

    case VALIDANDO:
      cancela.write(SERVO_FECHADO);
      digitalWrite(PIN_LED_VERDE, LOW);
      digitalWrite(PIN_LED_VERMELHO, LOW);
      eventIdAtual = gerarEventId();
      lcdMsg("Validando...", tipoAtual == ENTRADA ? "ENTRADA" : "SAIDA");
      resultadoAtual = validarAcesso(tipoAtual, eventIdAtual);  // bloqueia ate o timeout
      break;

    case ACESSO_LIBERADO:
      cancela.write(SERVO_ABERTO);
      digitalWrite(PIN_LED_VERDE, HIGH);
      digitalWrite(PIN_LED_VERMELHO, LOW);
      lcdMsg("ACESSO LIBERADO", tipoAtual == ENTRADA ? "ENTRADA" : "SAIDA");
      Serial.print("Evento registrado: ");
      Serial.println(eventIdAtual);
      break;

    case ACESSO_NEGADO:
      cancela.write(SERVO_FECHADO);
      digitalWrite(PIN_LED_VERDE, LOW);
      digitalWrite(PIN_LED_VERMELHO, HIGH);
      lcdMsg("ACESSO NEGADO", "Procure o suporte");
      break;

    case FALHA_REDE:
      cancela.write(SERVO_FECHADO);
      digitalWrite(PIN_LED_VERDE, LOW);
      lcdMsg("FALHA DE REDE", "Cancela fechada");
      break;

    case MANUTENCAO:
      cancela.write(SERVO_FECHADO);
      digitalWrite(PIN_LED_VERDE, HIGH);
      digitalWrite(PIN_LED_VERMELHO, HIGH);
      lcdMsg("MANUTENCAO", "Acesso suspenso");
      break;
  }
}

void iniciarEvento(TipoEvento tipo, const char* origem) {
  Serial.print("Acionamento de ");
  Serial.print(tipo == ENTRADA ? "ENTRADA" : "SAIDA");
  Serial.print(" por ");
  Serial.println(origem);
  tipoAtual = tipo;
  entrarEstado(VALIDANDO);
}

// Comandos no Monitor Serial:
//   r:ABC123 -> define o codigo da reserva enviado nos proximos eventos
//   a / n / f -> (modo simulado) autorizar / negar / falha de rede
void lerComandosSerial() {
  if (!Serial.available()) return;
  String linha = Serial.readStringUntil('\n');
  linha.trim();
  if (linha.length() == 0) return;

  if (linha.startsWith("r:")) {
    codigoReserva = linha.substring(2);
    codigoReserva.trim();
    Serial.print("[RESERVA] codigo definido: ");
    Serial.println(codigoReserva);
  } else if (linha == "a") {
    mockResultado = AUTORIZADO;
    Serial.println("[MOCK] proximas validacoes: AUTORIZADO");
  } else if (linha == "n") {
    mockResultado = NEGADO;
    Serial.println("[MOCK] proximas validacoes: NEGADO");
  } else if (linha == "f") {
    mockResultado = SEM_RESPOSTA;
    Serial.println("[MOCK] proximas validacoes: FALHA DE REDE");
  } else {
    Serial.println("Comandos: r:CODIGO | a | n | f");
  }
}

// ===================== SETUP =====================
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);

  pinMode(PIN_LED_VERDE, OUTPUT);
  pinMode(PIN_LED_VERMELHO, OUTPUT);
  pinMode(PIN_BTN_ENTRADA, INPUT_PULLUP);
  pinMode(PIN_BTN_SAIDA, INPUT_PULLUP);
  pinMode(PIN_BTN_MANUT, INPUT_PULLUP);

  pinMode(PIN_TRIG_ENTRADA, OUTPUT);
  pinMode(PIN_ECHO_ENTRADA, INPUT);
  pinMode(PIN_TRIG_SAIDA, OUTPUT);
  pinMode(PIN_ECHO_SAIDA, INPUT);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  lcd.init();
  lcd.backlight();

  ESP32PWM::allocateTimer(0);
  cancela.setPeriodHertz(50);
  cancela.attach(PIN_SERVO, 500, 2400);

  entrarEstado(INICIALIZANDO);
  lcdMsg("SmartPark IoT", "Conectando WiFi");
  conectarWifi(20000);

  if (backendConfigurado()) {
    Serial.println("Backend configurado: modo REAL");
  } else {
    Serial.println("Backend NAO configurado: modo SIMULADO (a / n / f)");
  }
  Serial.println("Comandos: r:CODIGO | a | n | f");

  entrarEstado(PRONTO);
  ultimaTelemetria = millis();
}

// ===================== LOOP =====================
void loop() {
  lerComandosSerial();
  manterWifi();

  bool clicouEntrada = pressionou(btnEntrada);
  bool clicouSaida   = pressionou(btnSaida);
  bool clicouManut   = pressionou(btnManut);

  switch (estado) {
    case PRONTO: {
      if (clicouManut)   { entrarEstado(MANUTENCAO); break; }
      if (clicouEntrada) { iniciarEvento(ENTRADA, "botao"); break; }
      if (clicouSaida)   { iniciarEvento(SAIDA, "botao");   break; }

      if (millis() - ultimaLeituraSensor >= INTERVALO_SENSOR_MS) {
        ultimaLeituraSensor = millis();
        if (detectou(sensorEntrada)) { iniciarEvento(ENTRADA, "sensor"); break; }
        if (detectou(sensorSaida))   { iniciarEvento(SAIDA, "sensor");   break; }
      }

      if (millis() - ultimaTelemetria >= INTERVALO_TELEMETRIA) {
        ultimaTelemetria = millis();
        enviarTelemetria();
      }
      break;
    }

    case VALIDANDO:
      if (resultadoAtual == AUTORIZADO)  entrarEstado(ACESSO_LIBERADO);
      else if (resultadoAtual == NEGADO) entrarEstado(ACESSO_NEGADO);
      else                               entrarEstado(FALHA_REDE);
      break;

    case ACESSO_LIBERADO:
      if (millis() - tEstado >= TEMPO_ABERTA_MS) entrarEstado(PRONTO);
      break;

    case ACESSO_NEGADO:
      if (millis() - tEstado >= TEMPO_NEGADO_MS) entrarEstado(PRONTO);
      break;

    case FALHA_REDE:
      digitalWrite(PIN_LED_VERMELHO, (millis() / 300) % 2);
      if (millis() - tEstado >= TEMPO_FALHA_MS) entrarEstado(PRONTO);
      break;

    case MANUTENCAO:
      if (clicouManut) {
        entrarEstado(PRONTO);
      } else if (clicouEntrada || clicouSaida) {
        Serial.println("Ignorado: modo manutencao");
      }
      if (millis() - ultimaTelemetria >= INTERVALO_TELEMETRIA) {
        ultimaTelemetria = millis();
        enviarTelemetria();
      }
      break;

    case INICIALIZANDO:
      break;
  }
}