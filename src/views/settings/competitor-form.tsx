import type { FC } from 'hono/jsx';

import { HANDLE_CHANNELS, type HandleChannel } from '../../services/settings-repo.js';
import { channelLabel } from '../../lib/channels.js';
import { IconX } from '../icons.js';

export type CompetitorFormValues = {
  name: string;
  domain: string;
  category: 'well' | 'plumbing' | 'both' | '';
  tier: 'local_same_size' | 'mondo_100m' | 'national' | 'inspiration' | '';
  handles: Partial<Record<HandleChannel, string>>;
};

export type CompetitorFormErrors = Partial<{
  form: string;
  name: string;
  domain: string;
  category: string;
  tier: string;
}>;

export type CompetitorFormProps = {
  mode: 'create' | 'edit';
  id?: string;
  values: CompetitorFormValues;
  errors?: CompetitorFormErrors;
};

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'well', label: 'Well' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'both', label: 'Both' },
];

const TIER_OPTIONS: { value: string; label: string }[] = [
  { value: 'local_same_size', label: 'Local, same size' },
  { value: 'mondo_100m', label: 'Mondo (~$100M)' },
  { value: 'national', label: 'National' },
  { value: 'inspiration', label: 'Inspiration' },
];

export const CompetitorForm: FC<CompetitorFormProps> = ({
  mode,
  id,
  values,
  errors,
}) => {
  const isEdit = mode === 'edit';
  const action = isEdit ? `/settings/competitors/${id}` : '/settings/competitors';
  const method = isEdit ? 'put' : 'post';
  const title = isEdit ? 'Edit Competitor' : 'Add Competitor';

  return (
    <div class="fc-modal" data-testid="competitor-form-modal">
      <div class="fc-modal__backdrop" data-modal-close="true"></div>
      <form
        class="fc-modal__panel"
        {...{ [`hx-${method}`]: action }}
        hx-target={
          isEdit ? `#competitor-row-${id}` : '#competitors-tbody'
        }
        hx-swap={isEdit ? 'outerHTML' : 'afterbegin'}
        data-testid="competitor-form"
      >
        <div class="fc-modal__header">
          <h2 class="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            class="fc-modal__close"
            data-modal-close="true"
            aria-label="Close"
          >
            <IconX size={18} class="w-[18px] h-[18px]" />
          </button>
        </div>

        <div class="fc-modal__body flex flex-col gap-4">
          {errors?.form ? (
            <div class="fc-form-error" data-testid="form-error">
              {errors.form}
            </div>
          ) : null}

          <Field
            label="Name"
            name="name"
            value={values.name}
            error={errors?.name}
            placeholder="e.g. Reliant Plumbing DFW"
          />
          <Field
            label="Domain"
            name="domain"
            value={values.domain}
            error={errors?.domain}
            placeholder="e.g. reliantplumbing.com"
          />

          <SelectField
            label="Category"
            name="category"
            value={values.category}
            error={errors?.category}
            options={CATEGORY_OPTIONS}
          />

          <SelectField
            label="Tier"
            name="tier"
            value={values.tier}
            error={errors?.tier}
            options={TIER_OPTIONS}
          />

          <fieldset class="border border-flowcore-border rounded-md p-3">
            <legend class="text-xs uppercase tracking-wider text-flowcore-text-secondary px-2">
              Handles
            </legend>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              {HANDLE_CHANNELS.map((channel) => (
                <Field
                  label={channelLabel(channel)}
                  name={`handle_${channel}`}
                  value={values.handles[channel] ?? ''}
                  placeholder={
                    channel === 'google_ads'
                      ? 'advertiser id (optional)'
                      : 'username / page slug'
                  }
                />
              ))}
            </div>
          </fieldset>
        </div>

        <div class="fc-modal__footer">
          <button type="button" class="btn-ghost" data-modal-close="true">
            Cancel
          </button>
          <button type="submit" class="btn-primary">
            {isEdit ? 'Save Changes' : 'Create Competitor'}
          </button>
        </div>
      </form>
    </div>
  );
};

const Field: FC<{
  label: string;
  name: string;
  value: string;
  error?: string;
  placeholder?: string;
}> = ({ label, name, value, error, placeholder }) => (
  <label class="flex flex-col gap-1">
    <span class="fc-form-label">{label}</span>
    <input
      type="text"
      name={name}
      value={value}
      placeholder={placeholder}
      class={error ? 'fc-input fc-input--error' : 'fc-input'}
      data-error={error ? 'true' : 'false'}
    />
    {error ? (
      <span class="fc-form-error-msg" data-field-error={name}>
        {error}
      </span>
    ) : null}
  </label>
);

const SelectField: FC<{
  label: string;
  name: string;
  value: string;
  error?: string;
  options: { value: string; label: string }[];
}> = ({ label, name, value, error, options }) => (
  <label class="flex flex-col gap-1">
    <span class="fc-form-label">{label}</span>
    <select
      name={name}
      class={error ? 'fc-input fc-input--error' : 'fc-input'}
      data-error={error ? 'true' : 'false'}
    >
      <option value="">— Select —</option>
      {options.map((opt) => (
        <option value={opt.value} selected={value === opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    {error ? (
      <span class="fc-form-error-msg" data-field-error={name}>
        {error}
      </span>
    ) : null}
  </label>
);
