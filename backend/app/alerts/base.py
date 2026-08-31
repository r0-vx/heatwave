from __future__ import annotations

from typing import Any, Protocol

import requests

from ..config import settings


class AlertProvider(Protocol):
    """Alert abstraction; the default implementation is local-only."""

    name: str

    def simulate(self, **context: Any) -> dict[str, Any]:
        ...


class AlertDeliveryError(RuntimeError):
    pass


class LocalAlertSimulator:
    name = "local_simulation"

    def simulate(self, **context: Any) -> dict[str, Any]:
        from .service import build_alert_previews

        return build_alert_previews(**context)


def _phone(value: str | None) -> str:
    return "".join(character for character in (value or "") if character.isdigit())


class Msg91TestProvider:
    """Restricted one-recipient test adapter. It never reports delivery."""

    name = "msg91_test"

    @property
    def configured(self) -> bool:
        return bool(
            settings.alert_provider == "msg91"
            and settings.sms_test_mode
            and settings.test_phone_number
            and settings.msg91_auth_key
            and settings.msg91_template_id
            and settings.msg91_sender_id
        )

    def send_test(self, *, recipient: str, ward_name: str, risk_category: str, message: str) -> dict[str, Any]:
        if not self.configured:
            raise AlertDeliveryError("MSG91 test delivery is not fully configured")
        normalized = _phone(recipient)
        allowed = _phone(settings.test_phone_number)
        if normalized != allowed:
            raise AlertDeliveryError("Recipient does not match TEST_PHONE_NUMBER")
        payload = {
            "template_id": settings.msg91_template_id,
            "sender": settings.msg91_sender_id,
            "short_url": "0",
            "recipients": [{"mobiles": normalized, "ward": ward_name, "risk": risk_category, "advice": message[:900]}],
        }
        try:
            response = requests.post(
                settings.msg91_flow_url,
                headers={"authkey": settings.msg91_auth_key or "", "accept": "application/json", "content-type": "application/json"},
                json=payload,
                timeout=settings.request_timeout_seconds,
            )
            body = response.json() if response.content else {}
        except (requests.RequestException, ValueError) as exc:
            raise AlertDeliveryError(f"MSG91 request failed: {type(exc).__name__}") from exc
        if not response.ok or (isinstance(body, dict) and str(body.get("type", "")).lower() == "error"):
            detail = body.get("message") if isinstance(body, dict) else None
            raise AlertDeliveryError(f"MSG91 rejected the test request ({response.status_code}): {detail or 'provider error'}")
        message_id = None
        if isinstance(body, dict):
            message_id = body.get("request_id") or body.get("message")
        return {
            "provider": self.name,
            "status": "ACCEPTED_BY_PROVIDER",
            "message_id": str(message_id) if message_id else None,
            "recipient": normalized,
            "provider_response": body if isinstance(body, dict) else {},
            "delivery_confirmed": False,
        }


def alert_provider_status() -> dict[str, Any]:
    provider = Msg91TestProvider()
    configured_number = _phone(settings.test_phone_number)
    masked = None
    if configured_number:
        masked = f"{'•' * max(0, len(configured_number) - 4)}{configured_number[-4:]}"
    return {
        "provider": provider.name if settings.alert_provider == "msg91" else "local_simulation",
        "mode": "TEST_SMS" if provider.configured else "SIMULATION_ONLY",
        "configured": provider.configured,
        "test_recipient": masked,
        "requirements": ["explicit UI confirmation", "recipient must equal TEST_PHONE_NUMBER", "MSG91/DLT-approved template"],
        "status_detail": "One-recipient test delivery enabled; provider acceptance is not delivery confirmation" if provider.configured else "External delivery disabled until all test-mode credentials are configured",
    }
