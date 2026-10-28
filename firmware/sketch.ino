#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ESP32Servo.h>

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASS = "";
const char* BASE_URL = "https://COLOQUE_A_URL_DO_TUNEL";
const char* DEVICE_ID = "esp32-portao-01";
const char* DEVICE_SECRET = "COLOQUE_O_SEGREDO_DO_DISPOSITIVO";
const bool FORCAR_SIMULADO = false;

const int TRIG_ENTRADA = 4;
const int ECHO_ENTRADA = 5;
const int TRIG_SAIDA = 6;
const int ECHO_SAIDA = 7;
const int PIN_SDA = 8;
const int PIN_SCL = 9;
const int PIN_SERVO = 10;
const int LED_VERDE = 11;
const int LED_VERMELHO = 12;
const int BTN_ENTRADA = 33;
const int BTN_SAIDA = 34;
const int BTN_MANUTENCAO = 35;

const float LIMITE_CM = 30.0;
const unsigned long TEMPO_PRESENCA = 600;
const unsigned long TEMPO_ABERTA = 5000;
const unsigned long TEMPO_NEGADO = 3000;
const unsigned long BLOQUEIO_APOS_EVENTO = 4000;
const unsigned long INTERVALO_TELEMETRIA = 30000;
const int HTTP_TIMEOUT_MS = 20000;

enum Estado { PRONTO, CONSULTANDO, ABERTA, NEGADO, FALHA_REDE, MANUTENCAO };

LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo cancela;

Estado estado = PRONTO;
unsigned long estadoDesde = 0;
unsigned long bloqueioAte = 0;
unsigned long ultimaLeitura = 0;
unsigned long ultimaTelemetria = 0;
unsigned long desdeEntrada = 0;
unsigned long desdeSaida = 0;
unsigned long ultimoPisca = 0;
bool piscaLigado = false;
bool antEntrada = false;
bool antSaida = false;
bool antManutencao = false;
bool simulado = false;
char respostaSim = 'a';
String codigoReserva = "";
String eventoPendente = "";
String tipoPendente = "";
int ultimoHttp = 0;
unsigned int contadorEventos = 0;

String ajustar(String s) {
  while (s.length() < 16) s += ' ';
  return s.substring(0, 16);
}

void tela(const String& a, const String& b = "") {
  lcd.setCursor(0, 0);
  lcd.print(ajustar(a));
  lcd.setCursor(0, 1);
  lcd.print(ajustar(b));
}

void abrirCancela() {
  cancela.write(90);
}

void fecharCancela() {
  cancela.write(0);
}

void mudar(Estado novo) {
  estado = novo;
  estadoDesde = millis();
  digitalWrite(LED_VERDE, novo == ABERTA ? HIGH : LOW);
  digitalWrite(LED_VERMELHO, (novo == NEGADO || novo == FALHA_REDE) ? HIGH : LOW);
  if (novo == ABERTA) abrirCancela(); else fecharCancela();
}

void telaPronto() {
  tela("SmartPark PRONTO", simulado ? "Modo simulado" : "Online");
}

String novoId() {
  contadorEventos++;
  return "esp-" + String((uint32_t)esp_random(), HEX) + "-" + String(contadorEventos);
}

float distancia(int trig, int echo) {
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long d = pulseIn(echo, HIGH, 25000);
  if (d == 0) return 999;
  return d * 0.0343f / 2;
}

bool presenca(int trig, int echo, unsigned long& desde) {
  if (distancia(trig, echo) < LIMITE_CM) {
    if (desde == 0) desde = millis();
    return millis() - desde >= TEMPO_PRESENCA;
  }
  desde = 0;
  return false;
}

bool pressionado(int pin, bool& anterior) {
  bool agora = digitalRead(pin) == LOW;
  bool evento = agora && !anterior;
  anterior = agora;
  return evento;
}

String detectarEvento() {
  if (millis() < bloqueioAte) return "";
  if (pressionado(BTN_ENTRADA, antEntrada)) return "ENTRY";
  if (pressionado(BTN_SAIDA, antSaida)) return "EXIT";
  if (millis() - ultimaLeitura >= 150) {
    ultimaLeitura = millis();
    if (presenca(TRIG_ENTRADA, ECHO_ENTRADA, desdeEntrada)) {
      desdeEntrada = 0;
      return "ENTRY";
    }
    if (presenca(TRIG_SAIDA, ECHO_SAIDA, desdeSaida)) {
      desdeSaida = 0;
      return "EXIT";
    }
  }
  return "";
}

bool respostaSimulada(bool& permitido, String& motivo) {
  delay(400);
  if (respostaSim == 'f') return false;
  permitido = respostaSim == 'a';
  motivo = permitido ? "OK" : "NO_RESERVATION";
  return true;
}

bool enviarAcesso(const String& tipo, bool& permitido, String& motivo) {
  ultimoHttp = 0;
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    ultimoHttp = -100;
    Serial.println("Wi-Fi desconectado");
    return false;
  }
  String corpo = "{\"event_id\":\"" + eventoPendente + "\",\"type\":\"" + tipo +
                 "\",\"reservation_code\":\"" + codigoReserva + "\"}";
  WiFiClientSecure cliente;
  cliente.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(cliente, String(BASE_URL) + "/api/iot/access-request")) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id", DEVICE_ID);
  http.addHeader("X-Device-Secret", DEVICE_SECRET);
  int codigo = http.POST(corpo);
  Serial.println("POST codigo: " + String(codigo) + " " + HTTPClient::errorToString(codigo));
  String resposta = codigo > 0 ? http.getString() : "";
  http.end();
  ultimoHttp = codigo;
  if (codigo != 200) return false;
  permitido = resposta.indexOf("\"allowed\":true") >= 0;
  int i = resposta.indexOf("\"reason\":\"");
  motivo = "";
  if (i >= 0) {
    i += 10;
    int f = resposta.indexOf('"', i);
    if (f > i) motivo = resposta.substring(i, f);
  }
  return true;
}

String textoMotivo(const String& m) {
  if (m == "NO_RESERVATION") return "SEM RESERVA";
  if (m == "NOT_CONFIRMED") return "NAO CONFIRMADA";
  if (m == "OUTSIDE_WINDOW") return "FORA DO HORARIO";
  if (m == "WRONG_LOT") return "OUTRO LOCAL";
  if (m == "ALREADY_INSIDE") return "JA ESTA DENTRO";
  if (m == "NOT_INSIDE") return "NAO ESTA DENTRO";
  return m;
}

void solicitar(const String& tipo) {
  mudar(CONSULTANDO);
  tela("Consultando...", tipo == "ENTRY" ? "Entrada" : "Saida");
  if (eventoPendente.length() == 0 || tipoPendente != tipo) {
    tipoPendente = tipo;
    eventoPendente = novoId();
  }
  bool permitido = false;
  String motivo = "";
  bool ok = simulado ? respostaSimulada(permitido, motivo)
                     : enviarAcesso(tipo, permitido, motivo);
  bloqueioAte = millis() + BLOQUEIO_APOS_EVENTO;
  if (!ok) {
    mudar(FALHA_REDE);
        tela("FALHA DE REDE", ultimoHttp != 0 ? "ERRO " + String(ultimoHttp) : "Cancela fechada");
    Serial.println("FALHA_REDE: cancela fechada");
    return;
  }
  eventoPendente = "";
  tipoPendente = "";
  if (permitido) {
    mudar(ABERTA);
    tela(tipo == "ENTRY" ? "ENTRADA LIBERADA" : "SAIDA LIBERADA", "Cancela aberta");
    Serial.println("ACESSO LIBERADO");
  } else {
    mudar(NEGADO);
    tela("ACESSO NEGADO", textoMotivo(motivo));
    Serial.println("ACESSO NEGADO: " + motivo);
  }
}

void enviarTelemetria() {
  if (simulado || WiFi.status() != WL_CONNECTED) return;
  WiFiClientSecure cliente;
  cliente.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(cliente, String(BASE_URL) + "/api/iot/telemetry")) return;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id", DEVICE_ID);
  http.addHeader("X-Device-Secret", DEVICE_SECRET);
  http.POST("{\"state\":\"PRONTO\",\"rssi\":" + String(WiFi.RSSI()) + "}");
  http.end();
}

void lerSerial() {
  if (!Serial.available()) return;
  String linha = Serial.readStringUntil('\n');
  linha.trim();
  if (linha.length() == 0) return;
  if (linha.startsWith("r:")) {
    String c = linha.substring(2);
    c.trim();
    codigoReserva = c;
    Serial.println("Reserva definida: " + codigoReserva);
    return;
  }
  if (simulado && (linha == "a" || linha == "n" || linha == "f")) {
    respostaSim = linha[0];
    if (respostaSim == 'a') Serial.println("Simulado: backend autoriza");
    if (respostaSim == 'n') Serial.println("Simulado: backend nega");
    if (respostaSim == 'f') Serial.println("Simulado: backend sem conexao");
    return;
  }
  Serial.println("Comandos: r:ID_DA_RESERVA | a | n | f (a, n, f so no modo simulado)");
}

void alternarManutencao() {
  if (estado == MANUTENCAO) {
    mudar(PRONTO);
    telaPronto();
    Serial.println("Manutencao desligada");
  } else {
    mudar(MANUTENCAO);
    tela("MANUTENCAO", "Cancela fechada");
    Serial.println("Manutencao ligada");
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(TRIG_ENTRADA, OUTPUT);
  pinMode(ECHO_ENTRADA, INPUT);
  pinMode(TRIG_SAIDA, OUTPUT);
  pinMode(ECHO_SAIDA, INPUT);
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_VERMELHO, OUTPUT);
  pinMode(BTN_ENTRADA, INPUT_PULLUP);
  pinMode(BTN_SAIDA, INPUT_PULLUP);
  pinMode(BTN_MANUTENCAO, INPUT_PULLUP);

  Wire.begin(PIN_SDA, PIN_SCL);
  lcd.init();
  lcd.backlight();
  cancela.attach(PIN_SERVO, 500, 2400);
  mudar(PRONTO);
  tela("SmartPark IoT", "Iniciando...");

  if (FORCAR_SIMULADO) {
    simulado = true;
  } else {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASS, 6);
    unsigned long inicio = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - inicio < 20000) {
      delay(250);
    }
    simulado = WiFi.status() != WL_CONNECTED;
  }

  Serial.println(simulado ? "Modo SIMULADO" : "Modo ONLINE (Wi-Fi conectado)");
  Serial.println("Comandos: r:ID_DA_RESERVA | a | n | f (a, n, f so no modo simulado)");
  telaPronto();
  ultimaTelemetria = millis();
}

void loop() {
  lerSerial();

  if (pressionado(BTN_MANUTENCAO, antManutencao)) {
    alternarManutencao();
  }

  if (estado == MANUTENCAO) {
    if (millis() - ultimoPisca > 500) {
      ultimoPisca = millis();
      piscaLigado = !piscaLigado;
      digitalWrite(LED_VERMELHO, piscaLigado);
    }
    return;
  }

  if (estado == ABERTA && millis() - estadoDesde > TEMPO_ABERTA) {
    mudar(PRONTO);
    telaPronto();
  }

  if (estado == NEGADO && millis() - estadoDesde > TEMPO_NEGADO) {
    mudar(PRONTO);
    telaPronto();
  }

  if (estado == PRONTO || estado == FALHA_REDE) {
    String tipo = detectarEvento();
    if (tipo.length() > 0) solicitar(tipo);
  }

  if (estado == PRONTO && millis() - ultimaTelemetria > INTERVALO_TELEMETRIA) {
    ultimaTelemetria = millis();
    enviarTelemetria();
  }
}