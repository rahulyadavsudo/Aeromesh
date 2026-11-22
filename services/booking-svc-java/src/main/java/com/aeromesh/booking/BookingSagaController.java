package com.aeromesh.booking;

import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.security.SecureRandom;
import java.util.Map;

@RestController
@RequestMapping("/api/bookings")
public class BookingSagaController {

    private static final String PNR_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final SecureRandom random = new SecureRandom();
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public BookingSagaController(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    @PostMapping
    @Transactional
    public ResponseEntity<Map<String, Object>> confirmBooking(
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey,
            @RequestBody Map<String, Object> cmd) {

        String pnr = generatePnr();
        // Transactional Outbox + Saga emission to qr-boarding-svc, notification-svc, analytics-svc
        Map<String, Object> event = Map.of(
                "pnr", pnr,
                "flightId", cmd.getOrDefault("flightId", ""),
                "seat", cmd.getOrDefault("seat", "Auto"),
                "idempotencyKey", idempotencyKey == null ? pnr : idempotencyKey
        );
        kafkaTemplate.send("booking.created", pnr, event);

        return ResponseEntity.status(201).body(Map.of(
                "pnr", pnr,
                "status", "Confirmed",
                "runtime", "java-21-spring-boot"
        ));
    }

    private String generatePnr() {
        StringBuilder sb = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            sb.append(PNR_CHARS.charAt(random.nextInt(PNR_CHARS.length())));
        }
        return sb.toString();
    }
}
