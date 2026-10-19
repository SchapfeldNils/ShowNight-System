-- S8-01: Ticketvorbereitung je Veranstaltung. Kein Bestand, keine Bestellungen, kein Verkauf.
CREATE TABLE ticket_settings (
  event_id uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  max_tickets_per_order integer NOT NULL DEFAULT 10 CHECK(max_tickets_per_order BETWEEN 1 AND 100),
  admission_at timestamptz,
  starts_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(sale_starts_at IS NULL OR sale_ends_at IS NULL OR sale_ends_at > sale_starts_at),
  CHECK(admission_at IS NULL OR starts_at IS NULL OR starts_at >= admission_at)
);
CREATE TABLE ticket_contingents (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  capacity integer NOT NULL CHECK(capacity BETWEEN 0 AND 100000),
  sort integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, id)
);
CREATE UNIQUE INDEX ticket_contingents_name ON ticket_contingents(event_id, lower(name));
CREATE TABLE ticket_types (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  contingent_id uuid NOT NULL,
  name text NOT NULL,
  public_description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL CHECK(price_cents BETWEEN 0 AND 1000000),
  type_limit integer CHECK(type_limit IS NULL OR type_limit BETWEEN 1 AND 100000),
  discount_hint text NOT NULL DEFAULT '',
  requires_purchase_confirmation boolean NOT NULL DEFAULT false,
  requires_admission_proof boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Ticketart und Kontingent gehören zwingend zur selben Veranstaltung.
  FOREIGN KEY (event_id, contingent_id) REFERENCES ticket_contingents(event_id, id)
);
CREATE UNIQUE INDEX ticket_types_name ON ticket_types(event_id, lower(name));
CREATE INDEX ticket_types_contingent ON ticket_types(contingent_id);
INSERT INTO schema_migrations(version) VALUES (8);
