package com.smartpark.backend.controller;

import com.smartpark.backend.dto.AccessRequest;
import com.smartpark.backend.dto.AccessResponse;
import com.smartpark.backend.service.AccessService;
import com.smartpark.backend.service.DeviceAuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/iot")
@RequiredArgsConstructor
public class IotController {

    private final DeviceAuthService deviceAuth;
    private final AccessService accessService;

    @PostMapping("/access-request")
    public AccessResponse accessRequest(
            @RequestHeader(value = "X-Device-Id", required = false) String deviceId,
            @RequestHeader(value = "X-Device-Secret", required = false) String secret,
            @Valid @RequestBody AccessRequest request) {
        String lotId = deviceAuth.autenticar(deviceId, secret);
        return accessService.processar(lotId, deviceId, request);
    }

    @PostMapping("/telemetry")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void telemetry(
            @RequestHeader(value = "X-Device-Id", required = false) String deviceId,
            @RequestHeader(value = "X-Device-Secret", required = false) String secret,
            @RequestBody Map<String, Object> body) {
        deviceAuth.autenticar(deviceId, secret);
        deviceAuth.registrarTelemetria(deviceId, body);
    }
}