from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class AudienceDefinition:
    id: str
    label: str
    recipient_group: str
    title: str
    aliases: tuple[str, ...] = ()


AUDIENCES: tuple[AudienceDefinition, ...] = (
    AudienceDefinition(
        id="citizens",
        label="Citizens / General Public",
        recipient_group="Ward residents",
        title="Heat Alert",
        aliases=("citizen", "citizens", "general public"),
    ),
    AudienceDefinition(
        id="hospitals",
        label="Hospitals / Healthcare Facilities",
        recipient_group="Ward hospitals and healthcare facilities",
        title="Heat Health Advisory",
        aliases=("hospital", "hospitals", "healthcare facilities"),
    ),
    AudienceDefinition(
        id="ambulance",
        label="Ambulance / Emergency Services",
        recipient_group="Ambulance and emergency response teams",
        title="Emergency Heat Advisory",
        aliases=("ambulance", "emergency services", "ambulance / emergency services"),
    ),
    AudienceDefinition(
        id="bmc",
        label="BMC / Municipal Authorities",
        recipient_group="Ward and municipal operations teams",
        title="Heat Action Advisory",
        aliases=("bmc", "municipal authorities", "ward response team", "municipal corporation"),
    ),
    AudienceDefinition(
        id="disaster_management",
        label="Disaster Management Authorities",
        recipient_group="Disaster management coordination teams",
        title="Heat Response Coordination Advisory",
        aliases=("disaster management", "disaster management authorities"),
    ),
    AudienceDefinition(
        id="outdoor_workers",
        label="Outdoor Workers / Employers",
        recipient_group="Outdoor workers and worksite supervisors",
        title="Outdoor Work Heat Advisory",
        aliases=("outdoor workers", "outdoor-work supervisors", "employers"),
    ),
    AudienceDefinition(
        id="vulnerable_support",
        label="Elderly / Vulnerable Population Support",
        recipient_group="Caregivers and vulnerable-population support teams",
        title="Heat Health Advisory",
        aliases=("elderly", "vulnerable population", "elderly / vulnerable support"),
    ),
)


def _key(value: str) -> str:
    return " ".join(value.strip().lower().replace("_", " ").replace("-", " ").split())


_AUDIENCE_LOOKUP = {
    _key(alias): audience
    for audience in AUDIENCES
    for alias in (audience.id, audience.label, *audience.aliases)
}


def resolve_audience(value: str) -> AudienceDefinition:
    return _AUDIENCE_LOOKUP.get(_key(value), AUDIENCES[0])


def audience_catalog() -> list[dict[str, str]]:
    return [
        {key: value for key, value in asdict(audience).items() if key != "aliases"}
        for audience in AUDIENCES
    ]
