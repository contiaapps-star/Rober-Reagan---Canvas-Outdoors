import type { FC } from 'hono/jsx';

import { IconX } from '../icons.js';

export type KeywordFormValues = {
  keyword: string;
  category: 'well' | 'plumbing' | 'both' | '';
  isActive: boolean;
};

export type KeywordFormErrors = Partial<{
  form: string;
  keyword: string;
  category: string;
}>;

export type KeywordFormProps = {
  mode: 'create' | 'edit';
  id?: string;
  values: KeywordFormValues;
  errors?: KeywordFormErrors;
};

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'well', label: 'Well' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'both', label: 'Both' },
];

export const KeywordForm: FC<KeywordFormProps> = ({ mode, id, values, errors }) => {
  const isEdit = mode === 'edit';
  const action = isEdit ? `/settings/keywords/${id}` : '/settings/keywords';
  const method = isEdit ? 'put' : 'post';
  const title = isEdit ? 'Edit Keyword' : 'Add Keyword';

  return (
    <div class="fc-modal" data-testid="keyword-form-modal">
      <div class="fc-modal__backdrop" data-modal-close="true"></div>
      <form
        class="fc-modal__panel"
        {...{ [`hx-${method}`]: action }}
        hx-target={isEdit ? `#keyword-row-${id}` : '#keywords-tbody'}
        hx-swap={isEdit ? 'outerHTML' : 'afterbegin'}
        data-testid="keyword-form"
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

          <label class="flex flex-col gap-1">
            <span class="fc-form-label">Keyword</span>
            <input
              type="text"
              name="keyword"
              value={values.keyword}
              placeholder="e.g. plumber Saginaw TX"
              class={errors?.keyword ? 'fc-input fc-input--error' : 'fc-input'}
              data-error={errors?.keyword ? 'true' : 'false'}
            />
            {errors?.keyword ? (
              <span class="fc-form-error-msg" data-field-error="keyword">
                {errors.keyword}
              </span>
            ) : null}
          </label>

          <label class="flex flex-col gap-1">
            <span class="fc-form-label">Category</span>
            <select
              name="category"
              class={errors?.category ? 'fc-input fc-input--error' : 'fc-input'}
              data-error={errors?.category ? 'true' : 'false'}
            >
              <option value="">— Select —</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option value={opt.value} selected={values.category === opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors?.category ? (
              <span class="fc-form-error-msg" data-field-error="category">
                {errors.category}
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
            {isEdit ? 'Save Changes' : 'Create Keyword'}
          </button>
        </div>
      </form>
    </div>
  );
};
