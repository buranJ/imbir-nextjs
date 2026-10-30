"use client";

import { FC, useRef, useState } from "react";
import toast from "react-hot-toast";

import { useRouter } from "next/navigation";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ClinicPageLayout } from "@/widgets/clinic/layout";

import {
  type DayKey,
  type DayState,
  useClinicCabinet,
} from "@/entities/clinic-profile";
import { useServiceCategories } from "@/entities/service";

import {
  addClinicService,
  clinicCabinetKeys,
  getClinicDoctors,
} from "@/shared/api";
import { EditIcon } from "@/shared/assets/icons";
import {
  DURATION_INPUT_ERROR,
  parseDurationInput,
} from "@/shared/lib/duration";
import { PRICE_INPUT_ERROR, parsePriceInput } from "@/shared/lib/price";
import {
  Button,
  Dropdown,
  IconBtn,
  ImageWithFallback,
  Input,
  Textarea,
} from "@/shared/ui";

import {
  EMPTY_SCHEDULE,
  ScheduleEditor,
  SpecialistsPicker,
  fromBranchDropdownValue,
  linkedDoctorIds,
  lunchToApi,
  procedureBranchOptions,
  scheduleToApi,
  toBranchDropdownValue,
} from "../procedure-form";

export const ClinicNewProcedurePage: FC = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: doctorsData } = useQuery({
    queryKey: clinicCabinetKeys.doctors(),
    queryFn: getClinicDoctors,
  });
  const doctors = doctorsData?.data ?? [];

  // Филиалы уже приходят в профиле клиники — отдельного запроса не нужно.
  const { rawProfile } = useClinicCabinet();
  const branchOptions = procedureBranchOptions(rawProfile);

  const [photoPreview, setPhotoPreview] = useState<string | undefined>();
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [category, setCategory] = useState("");
  // Категории — из справочника /api/service-categories/ (см. useServiceCategories)
  const { optionsWith: categoryOptionsWith, resolveCategoryId } =
    useServiceCategories();
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [branchId, setBranchId] = useState("");
  const [specialistIds, setSpecialistIds] = useState<string[]>([]);
  const [schedule, setSchedule] =
    useState<Record<DayKey, DayState>>(EMPTY_SCHEDULE);
  const [lunchFrom, setLunchFrom] = useState("");
  const [lunchTo, setLunchTo] = useState("");

  const setDay = (key: DayKey, patch: Partial<DayState>) =>
    setSchedule((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Превью рисуем из data-URL, а на бэк уходит сам File (multipart).
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const addMutation = useMutation({
    mutationFn: addClinicService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clinicCabinetKeys.services() });
      toast.success("Процедура добавлена");
      router.push("/clinic-profile/procedures");
    },
    onError: (err: unknown) => {
      const errData = (
        err as { response?: { data?: Record<string, string[]> } }
      )?.response?.data;
      toast.error(
        errData
          ? Object.values(errData).flat()[0]
          : "Не удалось сохранить процедуру. Попробуйте снова",
      );
    },
  });

  // undefined — в поле не целое число минут от 1 до суток; пусто — null.
  const parsedDuration = parseDurationInput(duration);
  // undefined — отрицательная или нечисловая цена; пусто — без цены.
  const parsedPrice = parsePriceInput(price);

  const handleSave = () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    // Бэк требует category (пустая → 400 «Это поле не может быть пустым»).
    // Ловим до запроса и явно называем поле — иначе пользователь видит
    // непонятную ошибку без привязки к полю.
    if (!category) {
      toast.error("Выберите специализацию");
      return;
    }
    if (parsedDuration === undefined) {
      toast.error(DURATION_INPUT_ERROR);
      return;
    }
    if (parsedPrice === undefined) {
      toast.error(PRICE_INPUT_ERROR);
      return;
    }
    addMutation.mutate({
      name: name.trim(),
      category,
      service_category_id: resolveCategoryId(category),
      description: description.trim() || undefined,
      price: parsedPrice ?? undefined,
      duration: parsedDuration,
      is_active: true,
      // Врачи клиники, которым назначается услуга. Бэк принимает только id
      // врачей, привязанных к этой клинике (иначе 400), и сам проставляет
      // услугу им в список.
      doctor_ids: linkedDoctorIds(doctors, specialistIds),
      ...(photoFile ? { photo: photoFile } : {}),
      branch_id: branchId ? Number(branchId) : null,
      schedule: scheduleToApi(schedule),
      lunch_break: lunchToApi(lunchFrom, lunchTo),
    });
  };

  return (
    <ClinicPageLayout
      title="Добавить процедуру"
      desktopTitle="Мой профиль"
      mobileAction={
        <IconBtn
          onClick={handleSave}
          disabled={addMutation.isPending}
          variant="text"
          size="sm"
          className="text-primary"
          aria-label="Сохранить"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M4 10L8 14L16 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconBtn>
      }
    >
      <div className="hidden md:flex items-center gap-4 mb-6">
        <IconBtn
          onClick={() => router.back()}
          variant="text"
          size="sm"
          className="shrink-0"
          aria-label="Назад"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M12.5 15L7.5 10L12.5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </IconBtn>
        <h2 className="text-[28px] font-semibold text-foreground flex-1">
          Добавить процедуру
        </h2>
        <Button onClick={handleSave} disabled={addMutation.isPending}>
          {addMutation.isPending ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhoto}
      />

      <div className="bg-white rounded-3xl border border-border p-5 mb-4 flex flex-col gap-4">
        <div>
          <label className="block text-foreground text-sm font-medium mb-1.5">
            Фото процедуры
          </label>
          <div className="relative w-28 h-28 rounded-2xl overflow-hidden bg-surface">
            <ImageWithFallback
              src={photoPreview}
              alt="Фото"
              fill
              sizes="112px"
              unoptimized={photoPreview?.startsWith("data:")}
              className="object-cover"
              fallback={
                <div className="w-full h-full flex items-center justify-center">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="20" fill="#F2F4F7" />
                  </svg>
                </div>
              }
            />
            <IconBtn
              onClick={() => photoInputRef.current?.click()}
              variant="outline"
              size="xs"
              className="absolute top-1.5 right-1.5 bg-white"
              aria-label="Добавить фото"
            >
              <EditIcon className="w-4 h-4" />
            </IconBtn>
          </div>
        </div>

        <Input
          label="Название"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setNameError(false);
          }}
          placeholder="Введите название"
          error={nameError ? "Обязательное поле" : undefined}
        />

        {/* Подпись именно «Категория услуги»: здесь справочник
            /references/service-categories/, а не специализации врачей. Одинаковая
            подпись над двумя разными списками читалась как рассинхрон данных. */}
        <Dropdown
          label="Категория услуги"
          placeholder="Выберите из списка"
          options={categoryOptionsWith(category)}
          searchable
          value={category}
          onChange={setCategory}
        />

        {/* Валюты нет: цена хранится и выводится в сомах — выбор «USD»
            раньше ни на что не влиял. */}
        <Input
          label="Стоимость, сом"
          type="number"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0"
          error={parsedPrice === undefined ? PRICE_INPUT_ERROR : undefined}
        />

        <Input
          label="Длительность, мин"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="Например, 30"
          error={
            parsedDuration === undefined ? DURATION_INPUT_ERROR : undefined
          }
        />
        <Textarea
          label="Описание"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Расскажите, как проходит процедура"
          rows={3}
        />

        {/* Бэк привязывает процедуру к филиалу (branch_id), а не к свободному
            тексту: название и адрес у филиала уже есть. По умолчанию —
            главный офис (branch_id = null), он и выбран в списке. */}
        <Dropdown
          label="Филиал, где проводится процедура"
          options={branchOptions}
          value={toBranchDropdownValue(branchId)}
          onChange={(value) => setBranchId(fromBranchDropdownValue(value))}
        />
      </div>

      <div className="bg-white rounded-3xl border border-border p-5 mb-4">
        <h3 className="text-foreground font-semibold text-lg mb-3">
          Специалисты, выполняющие услугу
        </h3>
        <SpecialistsPicker
          doctors={doctors}
          selectedIds={specialistIds}
          onAdd={(id) => setSpecialistIds((prev) => [...prev, id])}
          onRemove={(id) =>
            setSpecialistIds((prev) => prev.filter((x) => x !== id))
          }
          isEditing
        />
      </div>

      <div className="bg-white rounded-3xl border border-border p-5 mb-4">
        <h3 className="text-foreground font-semibold text-lg mb-1">
          График проведения процедуры
        </h3>
        <ScheduleEditor
          schedule={schedule}
          setDay={setDay}
          lunchFrom={lunchFrom}
          lunchTo={lunchTo}
          setLunchFrom={setLunchFrom}
          setLunchTo={setLunchTo}
          isEditing
        />
      </div>
    </ClinicPageLayout>
  );
};
