package com.smartpark.backend.dto;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class ParkingLotResponse {
    private String id;
    private String name;
    private String address;
    private double latitude;
    private double longitude;
    private long hourlyRateCents;
    private String openTime;
    private String closeTime;
    private int totalSpaces;
    private int freeSpaces;
}