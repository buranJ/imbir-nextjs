import {
  DAY_API,
  type DayKey,
  type DayState,
  toDay,
} from "@/entities/clinic-profile";

import {
  type ClinicPrivateProfile,
  type ClinicScheduleDay,
  branchLabel,
} from "@/shared/api";

// Где проходит процедура. Главный адрес клиники филиалом не заведён: процедура
// там — это branch_id = null, а в форме — пустая строка. Раньше в списке были
// только филиалы, и главный адрес выбрать было нельзя: менеджер видел один
// пункт (у Nova Clinic он ещё и назван как сама клиника) и не мог вернуть
// процедуру на главный адрес, однажды выбрав филиал.
export const MAIN_OFFICE_LABEL = "Главный офис";

// Значение пункта «Главный офис» в выпадающем списке. Не пустая строка:
// пустое значение Dropdown рисует серым, как незаполненное поле.
export const MAIN_OFFICE_VALUE = "main-office";

// branchId формы ↔ значение выпадающего списка.
export const toBranchDropdownValue = (branchId: string) =>
  branchId || MAIN_OFFICE_VALUE;
export const fromBranchDropdownValue = (value: string) =>
  value === MAIN_OFFICE_VALUE ? "" : value;

const withAddress = (label: string, address?: string) =>
  address?.trim() && address.trim() !== label
    ? `${label} — ${address.trim()}`
    : label;

export const procedureBranchOptions = (
  profile?: Pick<ClinicPrivateProfile, "address" | "branches">,
) => [
  {
    label: withAddress(MAIN_OFFICE_LABEL, profile?.address),
    value: MAIN_OFFICE_VALUE,
  },
  ...(profile?.branches ?? []).map((branch) => ({
    label: withAddress(branchLabel(branch), branch.address),
    value: String(branch.id),
  })),
];

// Локальная модель формы процедуры — поля с макета «Добавить/Редактировать
// процедуру». Бэк принимает их все: name/category/description/price/duration/
// is_active/doctor_ids, плюс photo, branch_id (филиал проведения), schedule и
// lunch_break — последние четыре появились после доработки бэка.
export type ProcedureFormState = {
  branchId: string;
  category: string;
  duration: string;
  lunchFrom: string;
  lunchTo: string;
  name: string;
  photoPreview?: string;
  price: string;
  schedule: Record<DayKey, DayState>;
  specialistIds: string[];
};

export const EMPTY_SCHEDULE: Record<DayKey, DayState> = {
  mon: { open: "", close: "", enabled: false },
  tue: { open: "", close: "", enabled: false },
  wed: { open: "", close: "", enabled: false },
  thu: { open: "", close: "", enabled: false },
  fri: { open: "", close: "", enabled: false },
  sat: { open: "", close: "", enabled: false },
  sun: { open: "", close: "", enabled: false },
};

export const EMPTY_PROCEDURE_FORM: ProcedureFormState = {
  photoPreview: undefined,
  name: "",
  category: "",
  price: "",
  duration: "",
  branchId: "",
  specialistIds: [],
  schedule: EMPTY_SCHEDULE,
  lunchFrom: "",
  lunchTo: "",
};

// Форма ↔ бэк: у формы дни это mon/tue/… с open/close, у бэка — monday/tuesday/…
// с from/to (тот же формат, что у графика клиники, см. DAY_API).
export const scheduleToApi = (
  schedule: Record<DayKey, DayState>,
): Record<string, ClinicScheduleDay> =>
  Object.fromEntries(
    (Object.keys(DAY_API) as DayKey[]).map((key) => [
      DAY_API[key],
      {
        enabled: schedule[key].enabled,
        from: schedule[key].open,
        to: schedule[key].close,
      },
    ]),
  );

export const scheduleFromApi = (
  api: null | Record<string, { enabled?: boolean; from?: string; to?: string }>,
): Record<DayKey, DayState> => {
  if (!api) return EMPTY_SCHEDULE;
  return Object.fromEntries(
    (Object.keys(DAY_API) as DayKey[]).map((key) => {
      const day = api[DAY_API[key]];
      return [
        key,
        toDay({ open: day?.from, close: day?.to, enabled: day?.enabled }),
      ];
    }),
  ) as Record<DayKey, DayState>;
};

// Обед отправляем только если заполнены обе границы — половинчатый интервал
// бэк сохранит как есть, и в карточке появится «13:00 – », что читается как
// сломанные данные.
export const lunchToApi = (from: string, to: string) =>
  from.trim() && to.trim() ? { from: from.trim(), to: to.trim() } : null;
