package com.smartpark.backend.controller;

import com.smartpark.backend.dto.AdminOverview;
import com.smartpark.backend.dto.AdminReservation;
import com.smartpark.backend.service.AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Rotas do operador. Só respondem para e-mails em ADMIN_EMAILS (ver FirebaseAuthInterceptor). */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService service;

    @GetMapping("/overview")
    public AdminOverview visaoGeral() throws Exception {
        return service.visaoGeral();
    }

    @GetMapping("/reservations")
    public List<AdminReservation> reservas(@RequestParam(required = false) String lotId,
                                           @RequestParam(required = false) String status)
            throws Exception {
        return service.reservas(lotId, status);
    }
}
