-- Explicit additive operator migration. Never applied by web startup or a GET.
CREATE TABLE IF NOT EXISTS manual_price_actions (
  id BIGSERIAL PRIMARY KEY,
  history_id INTEGER NOT NULL UNIQUE REFERENCES product_price_history(id),
  action TEXT NOT NULL CHECK (action IN ('activation','compensation')),
  reverses_history_id INTEGER UNIQUE REFERENCES product_price_history(id),
  scope TEXT NOT NULL CHECK (scope = 'global'),
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  approval_reference TEXT NOT NULL,
  before_prices JSONB NOT NULL,
  after_prices JSONB NOT NULL,
  live_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
