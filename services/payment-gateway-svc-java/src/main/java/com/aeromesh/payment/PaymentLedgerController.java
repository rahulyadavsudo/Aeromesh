package com.aeromesh.payment;

import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/payments")
public class PaymentLedgerController {

    private final Map<String, Map<String, Object>> idempotentLedger = new ConcurrentHashMap<>();
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public PaymentLedgerController(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    @PostMapping("/authorize")
    public ResponseEntity<Map<String, Object>> authorizePayment(@RequestBody Map<String, Object> req) {
        String idempotencyKey = String.valueOf(req.getOrDefault("idempotencyKey", ""));
        if (idempotencyKey.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "idempotencyKey required"));
        }

        if (idempotentLedger.containsKey(idempotencyKey)) {
            return ResponseEntity.ok(idempotentLedger.get(idempotencyKey));
        }

        String cardNumber = String.valueOf(req.getOrDefault("cardNumber", ""));
        if ("new-card".equals(req.get("method")) && !passesLuhn(cardNumber)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Card failed Luhn validation"));
        }

        String txId = "TX-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        BigDecimal amount = new BigDecimal(String.valueOf(req.getOrDefault("amount", "0")));
        String currency = String.valueOf(req.getOrDefault("currency", "USD"));

        Map<String, Object> receipt = Map.of(
                "transactionId", txId,
                "status", "Settled",
                "amountPaid", amount,
                "currency", currency,
                "idempotentReplay", false,
                "runtime", "java-21-ledger"
        );
        idempotentLedger.put(idempotencyKey, receipt);
        kafkaTemplate.send("payment.authorized", txId, receipt);
        return ResponseEntity.ok(receipt);
    }

    private boolean passesLuhn(String raw) {
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() < 13 || digits.length() > 19) return false;
        int sum = 0;
        boolean alt = false;
        for (int i = digits.length() - 1; i >= 0; i--) {
            int n = digits.charAt(i) - '0';
            if (alt) {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            alt = !alt;
        }
        return sum % 10 == 0;
    }
}
