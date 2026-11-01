package com.smartpark.backend.security;

/** Usuário autenticado, extraído do token do Firebase. */
public record AuthUser(String uid, String email, String name, boolean admin) {
}