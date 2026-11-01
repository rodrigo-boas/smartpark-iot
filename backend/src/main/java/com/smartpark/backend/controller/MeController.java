package com.smartpark.backend.controller;

import com.smartpark.backend.security.AuthUser;
import com.smartpark.backend.security.FirebaseAuthInterceptor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeController {

    @GetMapping("/api/me")
    public AuthUser eu(@RequestAttribute(FirebaseAuthInterceptor.ATTR) AuthUser user) {
        return user;
    }
}