CREATE TABLE IF NOT EXISTS training_schedules (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  time VARCHAR(20),
  location VARCHAR(255),
  trainer VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_schedules_date ON training_schedules(date);
