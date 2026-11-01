package com.smartpark.backend.security;

import com.google.firebase.FirebaseApp;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.cors.CorsUtils;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Exige um token válido do Firebase nas rotas privadas e identifica o usuário.
 * Rotas /api/admin/** exigem, além disso, que o e-mail esteja em ADMIN_EMAILS.
 */
@Component
public class FirebaseAuthInterceptor implements HandlerInterceptor {

    public static final String ATTR = "authUser";

    private final FirebaseAuth firebaseAuth;
    private final Set<String> adminEmails;

    public FirebaseAuthInterceptor(FirebaseApp app,
                                   @Value("${smartpark.admin-emails:}") String adminEmails) {
        this.firebaseAuth = FirebaseAuth.getInstance(app);
        this.adminEmails = Arrays.stream(adminEmails.split(","))
                .map(String::trim)
                .map(e -> e.toLowerCase(Locale.ROOT))
                .filter(e -> !e.isEmpty())
                .collect(Collectors.toSet());
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) {
        if (CorsUtils.isPreFlightRequest(request)) {
            return true;
        }

        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Entre na sua conta para continuar");
        }

        FirebaseToken token;
        try {
            token = firebaseAuth.verifyIdToken(header.substring(7).trim());
        } catch (FirebaseAuthException | IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Sessão inválida ou expirada. Entre novamente.");
        }

        String email = token.getEmail() == null ? "" : token.getEmail().toLowerCase(Locale.ROOT);
        boolean admin = !email.isEmpty() && adminEmails.contains(email);

        if (request.getRequestURI().startsWith("/api/admin") && !admin) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Acesso restrito ao operador");
        }

        request.setAttribute(ATTR, new AuthUser(token.getUid(), email, token.getName(), admin));
        return true;
    }
}