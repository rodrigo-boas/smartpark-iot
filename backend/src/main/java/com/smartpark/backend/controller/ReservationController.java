package com.smartpark.backend.controller;

import com.smartpark.backend.dto.CreateReservationRequest;
import com.smartpark.backend.dto.ReservationResponse;
import com.smartpark.backend.security.AuthUser;
import com.smartpark.backend.security.FirebaseAuthInterceptor;
import com.smartpark.backend.service.ReservationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/reservations")
@RequiredArgsConstructor
public class ReservationController {

    private final ReservationService service;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReservationResponse criar(@RequestAttribute(FirebaseAuthInterceptor.ATTR) AuthUser user,
                                     @Valid @RequestBody CreateReservationRequest request) {
        return service.criar(user.uid(), user.email(), request);
    }

    @GetMapping("/{id}")
    public ReservationResponse buscar(@RequestAttribute(FirebaseAuthInterceptor.ATTR) AuthUser user,
                                      @PathVariable String id) {
        return service.buscar(user.uid(), id);
    }
}