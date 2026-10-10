import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Input } from './ui';
import { api } from '../lib/api';

const FIELD_RULES = {
  lowStockThreshold: { label: 'Low-stock threshold', min: 1, max: 2147483647 },
  expiryWarningDays: { label: 'Expiry warning window', min: 0, max: 3650 },
};

function validateInteger(value, { label, min, max }) {
  if (value === '' || value == null) return `${label} is required.`;
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number)) return `${label} must be a whole number.`;
  if (number < min || number > max) return `${label} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`;
  return '';
}

export default function StockAlertSettings({ policy, onSaved, canEdit }) {
  const [values, setValues] = useState({
    lowStockThreshold: String(policy?.lowStockThreshold ?? ''),
    expiryWarningDays: String(policy?.expiryWarningDays ?? ''),
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValues({
      lowStockThreshold: String(policy?.lowStockThreshold ?? ''),
      expiryWarningDays: String(policy?.expiryWarningDays ?? ''),
    });
    setErrors({});
    setSaveError('');
  }, [policy?.lowStockThreshold, policy?.expiryWarningDays]);

  const updateValue = (field, value) => {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: validateInteger(value, FIELD_RULES[field]) }));
    setSaveError('');
    setSaved(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canEdit || saving) return;

    const nextErrors = Object.fromEntries(
      Object.entries(FIELD_RULES).map(([field, rule]) => [field, validateInteger(values[field], rule)])
    );
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const nextPolicy = {
      lowStockThreshold: Number(values.lowStockThreshold),
      expiryWarningDays: Number(values.expiryWarningDays),
    };

    setSaving(true);
    setSaveError('');
    setSaved(false);
    try {
      const response = await api.put('/stock/alert-policy', nextPolicy);
      if (response?.success !== true || !response.policy) {
        throw new Error('The server did not confirm the alert policy update. Please try again.');
      }
      setValues({
        lowStockThreshold: String(response.policy.lowStockThreshold),
        expiryWarningDays: String(response.policy.expiryWarningDays),
      });
      setErrors({});
      setSaved(true);
      onSaved?.(response.policy);
    } catch (error) {
      setSaveError(error?.message || 'Unable to save alert settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const lowStockError = validateInteger(values.lowStockThreshold, FIELD_RULES.lowStockThreshold);
  const expiryError = validateInteger(values.expiryWarningDays, FIELD_RULES.expiryWarningDays);
  const hasValidationErrors = Boolean(lowStockError || expiryError);

  return (
    <Card className="overflow-hidden border-slate-200">
      <CardHeader className="bg-slate-50/80">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Inventory signals</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Stock alert policy</h2>
            <p className="mt-1 text-sm text-slate-600">Set when staff should be warned about low or expiring stock.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${canEdit ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-700'}`}>
            {canEdit ? 'Editable policy' : 'Read only'}
          </span>
        </div>
      </CardHeader>

      <CardBody className="space-y-5">
        <form onSubmit={handleSubmit} noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-sm font-bold text-amber-800">01</span>
                <div>
                  <h3 className="font-semibold text-slate-900">Low-stock threshold</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Warn when on-hand stock has a positive quantity below this number. Zero stock is not included in this warning.
                  </p>
                </div>
              </div>
              <Input
                label="Threshold quantity"
                type="number"
                min="1"
                max="2147483647"
                step="1"
                inputMode="numeric"
                value={values.lowStockThreshold}
                onChange={event => updateValue('lowStockThreshold', event.target.value)}
                error={errors.lowStockThreshold}
                disabled={!canEdit || saving}
                readOnly={!canEdit}
                aria-describedby="low-stock-hint"
              />
              <p id="low-stock-hint" className="mt-2 text-xs text-slate-500">Whole number · 1 to 2,147,483,647</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-sm font-bold text-teal-800">02</span>
                <div>
                  <h3 className="font-semibold text-slate-900">Expiry warning window</h3>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Warn for goods expiring on or before today + this many days. Already expired goods are included.
                  </p>
                </div>
              </div>
              <Input
                label="Days ahead"
                type="number"
                min="0"
                max="3650"
                step="1"
                inputMode="numeric"
                value={values.expiryWarningDays}
                onChange={event => updateValue('expiryWarningDays', event.target.value)}
                error={errors.expiryWarningDays}
                disabled={!canEdit || saving}
                readOnly={!canEdit}
                aria-describedby="expiry-hint"
              />
              <p id="expiry-hint" className="mt-2 text-xs text-slate-500">Whole number · 0 to 3,650 days</p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-5 text-sky-900">
            This policy changes warnings only. It does not trigger reordering, stock receipt, or write-off actions.
          </div>

          {saveError && (
            <Alert type="error" className="mt-4" role="alert">
              <span className="font-semibold">Settings were not saved.</span> {saveError}
            </Alert>
          )}
          {saved && (
            <Alert type="success" className="mt-4" role="status">
              Alert policy saved and confirmed by the server.
            </Alert>
          )}

          {canEdit && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Changes take effect as warning rules; no stock movement is created.</p>
              <Button
                type="submit"
                disabled={saving || hasValidationErrors}
                className="min-w-36"
              >
                {saving ? 'Saving policy…' : 'Save alert policy'}
              </Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
