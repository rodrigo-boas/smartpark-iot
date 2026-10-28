package com.smartpark.backend.dto;

public record AccessResponse(boolean allowed, String reason) {
}