export const ROUTES = {
  // Статичные страницы
  HOME: "/",
  CLINICS: "/clinics",
  SPECIALISTS: "/specialists",
  PROFILE: "/profile",
  PROFILE_HISTORY: "/profile/history",
  CHATS: "/chat",
  VIDEOS: "/videos",
  RECORD: "/record",
  SERVICES: "/services",
  BLOG: "/blog",

  // Авторизация
  LOGIN: "/login",
  REGISTER: "/register",
  FORGOT_PASSWORD: "/forgot-password",

  // Информационные страницы (футер)
  CONTACTS: "/contacts",
  TERMS: "/terms",
  PRIVACY: "/privacy",
  // Образец согласия на обработку персональных данных (ссылка из регистрации)
  PERSONAL_DATA_CONSENT: "/documents/personal-data-consent",

  // Динамические страницы (передаем ID)
  CLINIC_DETAILS: (id: number | string) => `/clinics/${id}`,
  SPECIALIST_DETAILS: (id: number | string) => `/specialists/${id}`,
  // Отдельная страница всех отзывов: блок на карточке показывает только
  // первую страницу (20 штук), дальше — только здесь.
  CLINIC_REVIEWS: (id: number | string) => `/clinics/${id}/reviews`,
  SPECIALIST_REVIEWS: (id: number | string) => `/specialists/${id}/reviews`,
  BLOG_ARTICLE: (slug: string) => `/blog/${slug}`,

  // Страницы с Query-параметрами (Search)
  SEARCH: (params?: { category?: string; query?: string }) => {
    if (!params) return "/search";

    const searchParams = new URLSearchParams();
    if (params.query) searchParams.append("q", params.query);
    if (params.category) searchParams.append("category", params.category);

    return `/search?${searchParams.toString()}`;
  },

  // /record с предзаполненным врачом. Клиника: если известна явно (например,
  // мы уже на странице этой клиники) — передайте clinicId напрямую; иначе
  // передайте workplaces и она подставится сама, только если это
  // единственное место работы врача (иначе неоднозначно, пусть выберет сам
  // на странице записи). serviceId — сразу выбранная услуга этого врача.
  RECORD_FOR_DOCTOR: (
    doctorId: number | string,
    options?: {
      clinicId?: string;
      mode?: "offline" | "online";
      serviceId?: string;
      workplaces?: { clinicId: string }[];
    },
  ) => {
    const params = new URLSearchParams({ doctor: String(doctorId) });
    const clinicId =
      options?.clinicId ??
      (options?.workplaces?.length === 1
        ? options.workplaces[0].clinicId
        : undefined);
    if (clinicId) params.set("clinic", clinicId);
    if (options?.mode) params.set("mode", options.mode);
    if (options?.serviceId) params.set("service", options.serviceId);
    return `/record?${params.toString()}`;
  },
} as const;

// Кабинет каждой роли. Чужой кабинет в ?next= не открываем: пациент, вошедший
// по ссылке /doctor-profile/..., всё равно получил бы там пустую страницу.
const ROLE_CABINET_PREFIX: Record<string, string> = {
  patient: "/profile",
  doctor: "/doctor-profile",
  clinic: "/clinic-profile",
};

const startsWithSegment = (path: string, prefix: string) =>
  path === prefix ||
  path.startsWith(`${prefix}/`) ||
  path.startsWith(`${prefix}?`) ||
  path.startsWith(`${prefix}#`);

// Ссылка-приглашение клиники (/register/doctor?invite=…). Врач с аккаунтом
// уходит с неё на вход и должен вернуться обратно — там вместо анкеты кнопка
// «Принять приглашение».
const isDoctorInvitePath = (path: string) => {
  if (!startsWithSegment(path, `${ROUTES.REGISTER}/doctor`)) return false;
  const params = new URLSearchParams(path.split("#")[0].split("?")[1] ?? "");
  return params.has("invite") || params.has("invite_clinic_id");
};

// Адрес возврата после входа. Принимаем только относительный путь внутри
// сайта: "//evil.com" и "/\evil.com" браузер понимает как другой домен, а
// полный URL превратил бы /login?next= в открытый редирект. Сами /login и
// /register не возвращаем — иначе после входа человек снова увидит форму
// (кроме ссылки-приглашения: там вошедшему врачу форму не показываем).
// Обратный слэш и управляющие символы отбрасываем целиком: браузер выкидывает
// табы и переводы строк из URL, и "/\t/evil.com" превратился бы в "//evil.com".
export const getSafeNextPath = (
  raw: null | string | undefined,
): null | string => {
  if (!raw) return null;
  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(raw)
  )
    return null;
  if (startsWithSegment(raw, ROUTES.LOGIN)) return null;
  if (startsWithSegment(raw, ROUTES.REGISTER) && !isDoctorInvitePath(raw))
    return null;
  return raw;
};

// То же, но с учётом роли вошедшего: кабинет другой роли отбрасываем, и
// вызывающий код уводит в кабинет по умолчанию.
export const resolveNextPath = (
  raw: null | string | undefined,
  role: string,
): null | string => {
  const next = getSafeNextPath(raw);
  if (!next) return null;
  const foreignCabinet = Object.entries(ROLE_CABINET_PREFIX).some(
    ([cabinetRole, prefix]) =>
      cabinetRole !== role && startsWithSegment(next, prefix),
  );
  // Принять приглашение клиники может только врач — остальных в кабинет.
  if (role !== "doctor" && isDoctorInvitePath(next)) return null;
  return foreignCabinet ? null : next;
};

// Ссылка на вход с адресом возврата: после входа (и регистрации) человек
// попадает туда, откуда ушёл, а не всегда в свой кабинет.
export const loginHref = (next?: null | string): string => {
  const safe = getSafeNextPath(next);
  return safe
    ? `${ROUTES.LOGIN}?next=${encodeURIComponent(safe)}`
    : ROUTES.LOGIN;
};
