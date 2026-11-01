package com.smartpark.backend.config;

import com.smartpark.backend.security.FirebaseAuthInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final FirebaseAuthInterceptor authInterceptor;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins("http://localhost:4200")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("Authorization", "Content-Type");
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Rotas privadas. O mapa (/api/parking-lots), o IoT e o webhook continuam públicos.
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/me", "/api/reservations/**", "/api/admin/**");
    }
}