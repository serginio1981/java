"""Niveles de acceso: owner, family, guest."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

OWNER, FAMILY, GUEST = "owner", "family", "guest"
ROLES_FILE = "roles.yaml"  # mapea nombre de perfil -> rol, dentro de profiles_dir


@dataclass
class Role:
    name: str
    description: str
    capabilities: list[str] = field(default_factory=list)

    def can(self, capability: str) -> bool:
        return capability in self.capabilities


class PermissionManager:
    def __init__(self, cfg: dict, profiles_dir: str | Path):
        self.guest_mode = cfg.get("guest_mode", "limited")
        if self.guest_mode not in ("limited", "ignore"):
            raise ValueError("guest_mode debe ser 'limited' o 'ignore'")
        self.roles = {
            name: Role(name, r.get("description", ""), list(r.get("capabilities", [])))
            for name, r in cfg.get("roles", {}).items()
        }
        for required in (OWNER, FAMILY, GUEST):
            if required not in self.roles:
                raise ValueError(f"Falta el rol '{required}' en config.yaml")
        self._roles_file = Path(profiles_dir) / ROLES_FILE
        self.assignments: dict[str, str] = self._load_assignments()

    def _load_assignments(self) -> dict[str, str]:
        if self._roles_file.exists():
            return yaml.safe_load(self._roles_file.read_text(encoding="utf-8")) or {}
        return {}

    def assign(self, profile_name: str, role: str) -> None:
        if role not in (OWNER, FAMILY):
            raise ValueError("Solo se pueden enrolar perfiles 'owner' o 'family'")
        if role == OWNER and any(r == OWNER and n != profile_name for n, r in self.assignments.items()):
            raise ValueError("Ya existe un dueño enrolado")
        self.assignments[profile_name] = role
        self._roles_file.parent.mkdir(parents=True, exist_ok=True)
        self._roles_file.write_text(yaml.safe_dump(self.assignments, allow_unicode=True), encoding="utf-8")

    def role_for(self, profile_name: Optional[str]) -> Role:
        """Perfil no reconocido o sin rol asignado => guest (fail-closed)."""
        if profile_name is None:
            return self.roles[GUEST]
        return self.roles[self.assignments.get(profile_name, GUEST)]

    def should_respond(self, role: Role) -> bool:
        return not (role.name == GUEST and self.guest_mode == "ignore")
