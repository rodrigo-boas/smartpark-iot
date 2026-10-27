package com.smartpark.backend.controller;

import com.smartpark.backend.dto.CreateReservationRequest;
import com.smartpark.backend.dto.ReservationResponse;
import com.smartpark.backend.service.ReservationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reservations")
@RequiredArgsConstructor
public class ReservationController {

    // TEMPORÁRIO: será substituído pelo usuário do token do Firebase Auth
    private static final String DEMO_USER = "demo-user";

    private final ReservationService service;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReservationResponse criar(@Valid @RequestBody CreateReservationRequest request) {
        return service.criar(DEMO_USER, request);
    }

    @GetMapping("/{id}")
    public ReservationResponse buscar(@PathVariable String id) {
        return service.buscar(DEMO_USER, id);
    }
}