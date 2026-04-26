import type { FC } from 'hono/jsx';

export type InspirationFormValues = {
  kind: 'account' | 'keyword_search' | '';
  value: string;
  channel: 'tiktok' | 'youtube' | '';
  isActive: boolean;
};

export type InspirationFormErrors = Partial<{
  form: string;
  kind: string;
  value: string;
  channel: string;
}>;

export type InspirationFormProps = {
  mode: 'create' | 'edit';
  id?: string;
  values: InspirationFormValues;
  errors?: InspirationFormErrors;
};

const KIND_OPTIONS = [
  { value: 'account', label: 'Account' },
  { value: 'keyword_search', label: 'Keyword Search' },
];

const CHANNEL_OPTIONS = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
];

export const InspirationForm: FC<InspirationFormProps> = ({
  mode,
  id,
  values,
  errors,
}) => {
  const isEdit = mode === 'edit';
  const action = isEdit ? `/settings/inspiration/${id}` : '/settings/inspiration';
  const method = isEdit ? 'put' : 'post';
  const title = isEdit ? 'Edit Inspiration Source' : 'Add Inspiration Source';

  return (
    <div class="fc-modal" data-testid="inspiration-form-modal">
      <div class="fc-modal__backdrop" data-modal-close="true"></div>
      <form
        class="fc-modal__panel"
        {...{ [`hx-${method}`]: action }}
        hx-target={isEdit ? `#inspiration-row-${id}` : '#inspiration-tbody'}
        hx-swap={isEdit ? 'outerHTML' : 'afterbegin'}
        data-testid="inspiration-form"
      >
        <div class="fc-modal__header">
          <h2 class="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            class="fc-modal__close"
            data-modal-close="true"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div class="fc-modal__body flex flex-col gap-4">
          {errors?.form ? (
            <div class="fc-form-error" data-testid="form-error">
              {errors.form}
            </div>
          ) : null}

          <label class="flex flex-col gap-1">
            <span class="fc-form-label">Kind</span>
            <select
              name="kind"
              class={errors?.kind ? 'fc-input fc-input--error' : 'fc-input'}
            >
              <option value="">— Select —</option>
              {KIND_OPTIONS.map((opt) => (
                <option value={opt.value} selected={values.kind === opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors?.kind ? (
              <span class="fc-form-error-msg" data-field-error="kind">
                {errors.kind}
              </span>
            ) : null}
          </label>

          <label class="flex flex-col gap-1">
            <span class="fc-form-label">Value</span>
            <input
              type="text"
              name="value"
              value={values.value}
              placeholder="@handle or keyword phrase"
              class={errors?.value ? 'fc-input fc-input--error' : 'fc-input'}
            />
            {errors?.value ? (
              <span class="fc-form-error-msg" data-field-error="value">
                {errors.value}
              </span>
            ) : null}
          </label>

          <label class="flex flex-col gap-1">
            <span class="fc-form-label">Channel</span>
            <select
              name="channel"
              class={errors?.channel ? 'fc-input fc-input--error' : 'fc-input'}
            >
              <option value="">— Select —</option>
              {CHANNEL_OPTIONS.map((opt) => (
                <option value={opt.value} selected={values.channel === opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors?.channel ? (
              <span class="fc-form-error-msg" data-field-error="channel">
                {errors.channel}
              </span>
            ) : null}
          </label>

          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              name="isActive"
              value="on"
              checked={values.isActive}
              class="fc-checkbox"
            />
            <span class="text-sm">Active</span>
          </label>
        </div>

        <div class="fc-modal__footer">
          <button type="button" class="btn-ghost" data-modal-close="true">
            Cancel
          </button>
          <button type="submit" class="btn-primary">
            {isEdit ? 'Save Changes' : 'Create Source'}
          </button>
        </div>
      </form>
    </div>
  );
};
