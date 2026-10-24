package com.smartpark.backend.controller;

import com.smartpark.backend.dto.ParkingLotResponse;
import com.smartpark.backend.service.ParkingLotService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/parking-lots")
@RequiredArgsConstructor
public class ParkingLotController {

    private final ParkingLotService service;

    @GetMapping
    public List<ParkingLotResponse> listar() throws Exception {
        return service.listarAtivos();
    }
}