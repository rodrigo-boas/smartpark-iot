package com.smartpark.backend.service;

import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.smartpark.backend.dto.ParkingLotResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ParkingLotService {

    private final Firestore firestore;

    public List<ParkingLotResponse> listarAtivos()
            throws ExecutionException, InterruptedException {

        List<QueryDocumentSnapshot> lots = firestore.collection("parking_lots")
                .whereEqualTo("active", true)
                .get().get().getDocuments();

        List<QueryDocumentSnapshot> spaces = firestore.collection("spaces")
                .whereEqualTo("active", true)
                .get().get().getDocuments();

        Map<String, List<QueryDocumentSnapshot>> spacesByLot = spaces.stream()
                .collect(Collectors.groupingBy(d -> d.getString("parking_lot_id")));

        List<ParkingLotResponse> result = new ArrayList<>();
        for (QueryDocumentSnapshot doc : lots) {
            List<QueryDocumentSnapshot> lotSpaces =
                    spacesByLot.getOrDefault(doc.getId(), List.of());
            long free = lotSpaces.stream()
                    .filter(s -> "FREE".equals(s.getString("occupancy_state")))
                    .count();

            result.add(ParkingLotResponse.builder()
                    .id(doc.getId())
                    .name(doc.getString("name"))
                    .address(doc.getString("address"))
                    .latitude(doc.getDouble("latitude"))
                    .longitude(doc.getDouble("longitude"))
                    .hourlyRateCents(doc.getLong("hourly_rate_cents"))
                    .openTime(doc.getString("opening_hours.open"))
                    .closeTime(doc.getString("opening_hours.close"))
                    .totalSpaces(lotSpaces.size())
                    .freeSpaces((int) free)
                    .build());
        }
        return result;
    }
}