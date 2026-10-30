"use client";

import { FC, useEffect, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import { Footer } from "@/widgets/footer";
import { Header } from "@/widgets/header";
import { ReviewsSection } from "@/widgets/reviews";
import { VideosSwiper } from "@/widgets/videos-swiper";

import { useFavoriteToggle } from "@/features/favorite-toggle";
import {
  useDeleteReview,
  useHasMyReview,
  useSubmitReview,
} from "@/features/submit-review";

import {
  fetchDoctorInterviews,
  interviewsFromDoctor,
} from "@/entities/interview";
import { ServiceCard } from "@/entities/service";

// ИМПОРТЫ API
import { api, doctorKeys, reviewKeys, serviceKeys } from "@/shared/api";
import {
  GeoIcon,
  HeaderBackIcon,
  HeartIcon,
  OfflineRecordIcon,
  OnlineRecordIcon,
  UserCircleIcon,
} from "@/shared/assets/icons";
import { ROUTES } from "@/shared/config";
import { useAuthStore } from "@/shared/store";
import {
  AnimatedNumber,
  Button,
  ContactInfoModal,
  EmptyState,
  IconBtn,
  Spinner,
} from "@/shared/ui";
import { InfoCard } from "@/shared/ui/info-card";
import { StatsPanel } from "@/shared/ui/stats-panel";

import { SpecialistDetailsSkeleton } from "./skeleton";

type Props = {
  id: string;
  // Получено на сервере (app/specialists/[id]/page.tsx) и передано как
  // initialData в useQuery — иначе клиент всегда стартует с isLoading=true и
  // на секунду показывает текст "Загрузка специалиста..." поверх уже
  // отрисованного skeleton'а из loading.tsx, даже если данные пришли почти
  // мгновенно.
  initialDoctor?: Awaited<ReturnType<typeof api.getDoctorById>>;
  // Когда сервер получил initialDoctor. Страница отдаётся из кеша (ISR) и
  // может пролежать там дольше, чем данные остаются свежими; без этой отметки
  // React Query считал бы их полученными только что и не обновлял.
  initialDoctorUpdatedAt?: number;
  // Услуги врача, полученные там же и в тот же момент.
  initialServices?: Awaited<ReturnType<typeof api.getServices>>;
};

type DoctorService = Awaited<ReturnType<typeof api.getServices>>[number];

// Заглушка вместо фото врача. Инициал в фирменном градиентном круге — тот же
// приём, что в сайдбаре кабинета и в карточках отзывов, поэтому читается как
// часть оформления, а не как «картинка не загрузилась». Фон плашки остаётся
// персиковым, так что блок не выбивается из общей палитры страницы.
const DoctorPhotoFallback: FC<{ name: string }> = ({ name }) => {
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="size-32 md:size-40 rounded-full bg-linear-to-br from-primary to-[#FF8A6B] flex items-center justify-center shadow-sm">
        {initial ? (
          <span className="text-white text-5xl md:text-6xl font-semibold select-none">
            {initial}
          </span>
        ) : (
          <UserCircleIcon className="size-16 text-white/80" />
        )}
      </div>
      <span className="text-muted text-sm">Фото не добавлено</span>
    </div>
  );
};

export const SpecialistDetailsPage: FC<Props> = ({
  id,
  initialDoctor,
  initialDoctorUpdatedAt,
  initialServices,
}) => {
  const router = useRouter();
  const [isOfflineInfoOpen, setIsOfflineInfoOpen] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  // 1. ПОЛУЧАЕМ ДАННЫЕ ВРАЧА
  const {
    data: doctor,
    isLoading: isDoctorLoading,
    isError: isDoctorError,
  } = useQuery({
    queryKey: doctorKeys.detail(id),
    queryFn: () => api.getDoctorById(id),
    initialData: initialDoctor,
    initialDataUpdatedAt: initialDoctorUpdatedAt,
  });

  // 2. ПОЛУЧАЕМ ОТЗЫВЫ ЭТОГО ВРАЧА
  const user = useAuthStore((s) => s.user);
  const isDoctor = user?.role === "doctor";
  // Оценивают только пациенты (и гости — им по клику предложат войти). Врач
  // ставил себе 5★ со своей же страницы, клиника — врачу; бэк такие отзывы
  // теперь отклоняет, а здесь мы просто не показываем им форму.
  const canReview = !user || user.role === "patient";
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken));
  const { isSaved, isPending, toggle } = useFavoriteToggle("doctor");
  const isFavorite = isSaved(Number(id));
  const isFavoritePending = isPending(Number(id));
  const serviceFavorites = useFavoriteToggle("service");

  // Запись — главное действие на этой странице, а /record с её формой — самый
  // тяжёлый экран сайта. Без префетча (кнопки записи — это router.push, а не
  // Link, и Next сам их не подгружает) после тапа «Онлайн» браузер сначала
  // скачивал код и данные страницы записи, и только потом показывал её:
  // около 0.7 с на телефоне, и всё это время кнопка выглядела «мёртвой».
  // Адрес один для мобильной и десктопной кнопок «Онлайн». Раньше мобильная
  // вела на /record?doctor=id без mode=online — и вместо онлайн-консультации
  // оформлялась обычная офлайн-запись.
  const onlineRecordHref = doctor
    ? ROUTES.RECORD_FOR_DOCTOR(id, {
        workplaces: doctor.workplaces,
        mode: "online",
      })
    : null;
  const canBookOnline = !isDoctor && Boolean(doctor?.isOnlineAvailable);
  useEffect(() => {
    if (!canBookOnline || !onlineRecordHref) return;
    router.prefetch(onlineRecordHref);
  }, [canBookOnline, onlineRecordHref, router]);

  const { data: reviews = [] } = useQuery({
    queryKey: reviewKeys.byTarget("doctor", id),
    queryFn: () => api.getReviewsByDoctor(id),
  });

  // Услуги врача: и собственные (без клиники), и процедуры клиник, где его на
  // них назначили. Тот же запрос, что у формы записи.
  const { data: services = [] } = useQuery({
    queryKey: serviceKeys.list({ doctor_id: id }),
    queryFn: () => api.getServices({ doctor_id: id, page_size: 100 }),
    initialData: initialServices,
    initialDataUpdatedAt: initialDoctorUpdatedAt,
  });

  const { isSubmitting, submitReview } = useSubmitReview("doctor", id);
  const { removeReview } = useDeleteReview("doctor", id);
  const alreadyReviewed = useHasMyReview("doctor", id);

  // 3. ИНТЕРВЬЮ ЭТОГО ВРАЧА — из его профиля. Общий список /api/interviews/
  // (топ-100) запрашиваем, только если профиль пришёл без interviews.
  const { data: fetchedInterviews = [] } = useQuery({
    queryKey: ["interviews", "doctor", id],
    queryFn: () => fetchDoctorInterviews(id),
    enabled: Boolean(doctor) && doctor?.interviews === undefined,
  });
  const doctorInterviews = doctor?.interviews
    ? interviewsFromDoctor(doctor, doctor.interviews)
    : fetchedInterviews;

  if (isDoctorError || (!isDoctorLoading && !doctor)) {
    return (
      <main className="min-h-screen bg-background flex flex-col">
        <div className="hidden md:block">
          <Header />
        </div>
        <div className="md:hidden">
          <Header title="Специалист" backTo={ROUTES.SPECIALISTS} />
        </div>

        <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 flex items-center">
          <EmptyState
            className="w-full"
            icon={<UserCircleIcon className="size-6" />}
            title="Специалист не найден"
            description="Возможно, анкету удалили или ссылка устарела. Посмотрите других специалистов — возможно, кто-то из них подойдёт."
            action={
              <Button size="md" onClick={() => router.push(ROUTES.SPECIALISTS)}>
                К списку специалистов
              </Button>
            }
          />
        </div>
      </main>
    );
  }

  // Тот же скелет, что у маршрута (app/specialists/[id]/loading.tsx).
  // Раньше здесь был текст «Загрузка специалиста...», и при переходе со
  // списка он подменял собой уже отрисованный каркас.
  if (isDoctorLoading || !doctor) {
    return <SpecialistDetailsSkeleton />;
  }

  // Детальные поля бэк заполняет не для каждого врача. Ничего не выдумываем:
  // чего нет — того не показываем (раньше здесь стояли правдоподобные тексты,
  // включая чужой телефон и почту, и пациент видел их как данные врача).
  const education = doctor.education;
  const about = doctor.about;
  const workExperience = doctor.workExperience ?? [];
  const skills = doctor.skills ?? [];

  // Одни и те же пропсы для обеих раскладок блока «Услуги».
  const serviceCardProps = (service: DoctorService) => ({
    id: service.id,
    name: service.name,
    category: service.category,
    clinic: service.clinicName,
    rating: service.rating,
    reviews: service.reviews,
    price: service.price,
    duration: service.duration,
    image: service.image,
    // Запись сразу к этому врачу на эту услугу. Процедура клиники — в той же
    // клинике; собственная услуга врача — по месту работы, если оно одно.
    href: ROUTES.RECORD_FOR_DOCTOR(id, {
      clinicId: service.clinicId || undefined,
      serviceId: service.id,
      workplaces: doctor.workplaces,
    }),
    isSaved: serviceFavorites.isSaved(Number(service.id)),
    isPending: serviceFavorites.isPending(Number(service.id)),
    onSave: () => serviceFavorites.toggle(Number(service.id)),
  });

  return (
    <main className="min-h-screen bg-background md:bg-white flex flex-col relative pb-20 md:pb-0">
      <div className="hidden md:block">
        <Header />
      </div>

      <div className="flex-1 w-full max-w-350 mx-auto md:px-8 flex flex-col pt-0 md:pt-6 pb-10">
        <div className="hidden md:flex text-sm text-secondary mb-6 items-center gap-2">
          <Link
            href={ROUTES.HOME}
            className="hover:text-primary transition-colors"
          >
            Главная
          </Link>
          <span>•</span>
          <Link
            href={ROUTES.SPECIALISTS}
            className="hover:text-primary transition-colors"
          >
            Специалисты
          </Link>
          <span>•</span>
          <span className="text-primary">{doctor.name}</span>
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-10">
          <div className="h-fit w-full md:sticky md:top-0 md:w-130 shrink-0">
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 md:hidden">
              <IconBtn
                variant="outline"
                size="sm"
                className="bg-white/80 backdrop-blur"
                onClick={() => window.history.back()}
              >
                <HeaderBackIcon className="size-4" />
              </IconBtn>
              <IconBtn
                variant="outline"
                size="sm"
                className="bg-white/80 backdrop-blur"
                disabled={isFavoritePending}
                aria-label={
                  isFavorite ? "Убрать из сохранённых" : "Сохранить врача"
                }
                onClick={() => toggle(Number(id))}
              >
                {isFavoritePending ? (
                  <Spinner className="size-5 text-[#FFA18D]" />
                ) : (
                  <HeartIcon
                    className={
                      isFavorite
                        ? "size-5 [&_path]:fill-[#FFA18D] [&_path]:stroke-[#FFA18D]"
                        : "size-5 text-[#FFA18D]"
                    }
                  />
                )}
              </IconBtn>
            </div>

            <div className="relative w-full h-85 md:h-125 bg-[#FFEFE5] md:rounded-3xl overflow-hidden flex items-center justify-center">
              {doctor.image && !photoFailed ? (
                <>
                  {/* Фото большое и грузится заметно дольше остальной
                      страницы. Пока оно идёт — шиммер во всю плашку, иначе
                      пользователь видит пустой персиковый прямоугольник и не
                      понимает, есть фото или нет. */}
                  {!photoLoaded && (
                    <div className="absolute inset-0 skeleton" />
                  )}
                  <Image
                    src={doctor.image}
                    alt={doctor.name}
                    fill
                    // Это LCP-элемент страницы (виден сразу, без скролла) —
                    // без priority next/image ставит loading="lazy" и браузер
                    // не начинает грузить фото, пока JS до него не дойдёт.
                    // Подтверждено Lighthouse: ~1.3с чистой задержки на LCP.
                    priority
                    fetchPriority="high"
                    sizes="(min-width: 768px) 400px, 100vw"
                    // Фото видно сразу, а не только после onLoad. Раньше оно
                    // было прозрачным, пока не отработает setPhotoLoaded, то
                    // есть пока не загрузится и не выполнится весь JS: браузер
                    // давно скачал картинку, но показывал её на секунду-полторы
                    // позже (на телефоне именно эта картинка — LCP). Шиммер
                    // выше лежит под фото и просто закрывается им по мере
                    // загрузки.
                    className="object-cover object-top"
                    onLoad={() => setPhotoLoaded(true)}
                    // Битая ссылка — показываем ту же заглушку, что и при
                    // отсутствии фото, а не сломанную картинку поверх шиммера.
                    onError={() => setPhotoFailed(true)}
                  />
                </>
              ) : (
                <DoctorPhotoFallback name={doctor.name} />
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col rounded-t-3xl md:rounded-none -mt-6 md:mt-0 relative z-10 p-2 md:p-0">
            <div className="bg-white rounded-[20px] p-4 border border-border-soft">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-2xl md:text-3xl font-semibold text-foreground leading-tight">
                      {doctor.name}
                    </h1>
                  </div>
                  <p className="text-muted text-base">{doctor.specialty}</p>

                  <div className="mt-3 flex flex-col gap-1.5">
                    {doctor.workplaces?.map((workplace) => (
                      <div
                        key={workplace.clinicId}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <span className="text-primary">
                          <GeoIcon className="size-4" />
                        </span>
                        <span>{workplace.clinicName}</span>
                        {workplace.price !== undefined && (
                          <span className="text-muted ml-auto font-medium">
                            {workplace.price} с
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <IconBtn
                  variant="outline"
                  size="md"
                  disabled={isFavoritePending}
                  aria-label={
                    isFavorite ? "Убрать из сохранённых" : "Сохранить врача"
                  }
                  onClick={() => toggle(Number(id))}
                >
                  {isFavoritePending ? (
                    <Spinner className="size-5 text-[#FFA18D]" />
                  ) : (
                    <HeartIcon
                      className={
                        isFavorite
                          ? "size-5 [&_path]:fill-[#FFA18D] [&_path]:stroke-[#FFA18D]"
                          : "size-5"
                      }
                    />
                  )}
                </IconBtn>
              </div>

              {/* Без отзывов рейтинга нет — «0.00» читается как самая низкая
                  оценка, а не как «ещё не оценивали». В карточках списков
                  рейтинг в этом случае уже скрыт. */}
              <StatsPanel
                rating={
                  doctor.reviews > 0 ? (
                    <AnimatedNumber value={doctor.rating} decimals={2} />
                  ) : (
                    "—"
                  )
                }
                experience={
                  <>
                    <AnimatedNumber value={doctor.experience} /> лет
                  </>
                }
                experienceLabel="Стаж"
                reviews={<AnimatedNumber value={doctor.reviews} />}
              />
            </div>

            <div className="hidden md:flex gap-4 mb-10 mt-4">
              {!isDoctor && (
                <>
                  <Button
                    variant="outline"
                    size="md"
                    className="flex-1 justify-center bg-[#FFF2F0] border-transparent text-primary hover:bg-[#FFEAE5]"
                    onClick={() => setIsOfflineInfoOpen(true)}
                  >
                    <span className="flex gap-2.5">
                      <OfflineRecordIcon className="size-5" />
                      Офлайн-запись
                    </span>
                  </Button>
                  {doctor.isOnlineAvailable && (
                    <Button
                      className="flex-1 justify-center"
                      size="md"
                      onClick={() =>
                        router.push(
                          ROUTES.RECORD_FOR_DOCTOR(id, {
                            workplaces: doctor.workplaces,
                            mode: "online",
                          }),
                        )
                      }
                    >
                      <span className="flex gap-2.5">
                        <OnlineRecordIcon className="size-6" />
                        Онлайн консультация
                      </span>
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-col gap-2 md:gap-10 md:border-none pt-8 md:pt-0">
              {education && education.length > 0 && (
                <InfoCard title="Образование" expandable lines={3}>
                  <div className="flex flex-col gap-1">
                    {education.map((line, idx) => (
                      <p key={idx}>{line}</p>
                    ))}
                  </div>
                </InfoCard>
              )}
              {/* Текст врач пишет сам (регистрация, «Мои данные»), отсюда и
                  «О себе». pre-line — чтобы не слипались его абзацы. */}
              {about && (
                <InfoCard title="О себе" expandable lines={3}>
                  <span className="whitespace-pre-line wrap-break-word">
                    {about}
                  </span>
                </InfoCard>
              )}

              {/* В отличие от «Образования» и «О себе», рендерим карточку и
                  при пустом списке: маркер-чёрточка нужен только рядом с
                  реальной записью, а на пустом месте выглядел как баг бэка. */}
              <InfoCard title="Опыт работы" expandable={false}>
                {workExperience.length > 0 ? (
                  <div className="flex flex-col gap-5">
                    {workExperience.map((exp, idx) => (
                      <div key={idx} className="relative pl-5">
                        <span className="absolute left-0 top-2.5 w-2.5 h-0.5 bg-primary" />
                        {exp.years ? (
                          <div className="mb-1">
                            <span className="text-foreground font-medium text-sm md:text-base">
                              {exp.years}{" "}
                            </span>
                            <span className="text-primary text-sm md:text-base">
                              {exp.duration}
                            </span>
                          </div>
                        ) : (
                          exp.qualification && (
                            <div className="mb-1">
                              <span className="text-primary text-sm md:text-base">
                                {exp.qualification}
                              </span>
                            </div>
                          )
                        )}
                        <p className="text-foreground text-sm md:text-base">
                          {exp.place}
                        </p>
                        <p className="text-muted text-sm md:text-base">
                          {exp.role}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted text-sm md:text-base">
                    Врач пока не указал опыт работы
                  </p>
                )}
              </InfoCard>

              {skills.length > 0 && (
                <InfoCard title="Профессиональные навыки" expandable={false}>
                  <ul className="flex flex-col gap-3">
                    {skills.map((skill, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <span className="text-primary font-medium text-lg leading-none mt-0.5">
                          —
                        </span>
                        <span className="text-muted text-sm md:text-base leading-relaxed">
                          {skill}
                        </span>
                      </li>
                    ))}
                  </ul>
                </InfoCard>
              )}
            </div>
          </div>
        </div>

        {/* Услуг у врача может не быть вовсе — тогда и блока нет. Раскладка
            как в каталоге /services: на телефоне горизонтальные карточки
            списком, на десктопе сетка вертикальных. Стоит выше отзывов, как
            и на странице клиники: это продолжение записи, а не её итог. */}
        {services.length > 0 && (
          <div className="mt-10 md:mt-20 px-2 md:px-0">
            <h2 className="text-2xl font-semibold text-foreground mb-6 md:mb-8 px-2 md:px-0">
              Услуги
            </h2>
            <div className="flex flex-col gap-2 md:hidden">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  {...serviceCardProps(service)}
                  variant="horizontal"
                />
              ))}
            </div>
            <div className="hidden md:grid md:grid-cols-4 gap-5 items-stretch">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  {...serviceCardProps(service)}
                  variant="vertical"
                />
              ))}
            </div>
          </div>
        )}

        {/* Секция отзывов: форма доступна авторизованным, список — всегда */}
        {(reviews.length > 0 || (isAuthed && canReview)) && (
          <ReviewsSection
            initialReviews={reviews}
            averageRating={doctor.rating}
            totalCount={doctor.reviews}
            canReview={canReview}
            doctorName={doctor.name}
            doctorSpecialty={doctor.specialty}
            doctorClinic={doctor.workplaces?.[0]?.clinicName}
            doctorImage={
              typeof doctor.image === "string" ? doctor.image : undefined
            }
            onSubmitReview={isAuthed ? submitReview : undefined}
            isSubmitting={isSubmitting}
            onDeleteReview={isAuthed ? removeReview : undefined}
            alreadyReviewed={alreadyReviewed}
            allReviewsHref={ROUTES.SPECIALIST_REVIEWS(id)}
          />
        )}

        {doctorInterviews.length > 0 && (
          <div className="mt-10 md:mt-20 mb-10 md:mb-20 px-4 md:px-0">
            <div className="flex items-center justify-between mb-6 md:mb-8 md:hidden">
              <h2 className="text-2xl font-semibold text-foreground">
                Интервью
              </h2>
              <Link
                href={ROUTES.VIDEOS}
                className="text-primary text-sm font-medium hover:underline"
              >
                Все
              </Link>
            </div>

            <VideosSwiper
              title="Интервью"
              viewAllHref={ROUTES.VIDEOS}
              description="Ознакомьтесь с интервью этого врача"
              videos={doctorInterviews}
              className="px-0 md:px-0"
            />
          </div>
        )}
      </div>

      <div className="hidden md:block">
        <Footer />
      </div>

      {!isDoctor && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white p-4 border-t border-border-soft z-50 flex gap-2 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
          {/* Те же иконки, что в десктопной паре кнопок выше — на мобильном
              их не было вовсе, и подписи укорочены («Онлайн консультация» →
              «Онлайн»), иначе иконка с текстом не помещались в одну строку. */}
          <Button
            className="flex-1 justify-center bg-[#FFF2F0] text-primary border border-transparent"
            size="lg"
            IconLeft={OfflineRecordIcon}
            onClick={() => setIsOfflineInfoOpen(true)}
          >
            Офлайн
          </Button>
          {doctor.isOnlineAvailable && (
            <Button
              className="flex-1 justify-center"
              size="lg"
              IconLeft={OnlineRecordIcon}
              onClick={() =>
                router.push(
                  ROUTES.RECORD_FOR_DOCTOR(id, {
                    workplaces: doctor.workplaces,
                    mode: "online",
                  }),
                )
              }
            >
              Онлайн
            </Button>
          )}
        </div>
      )}

      <ContactInfoModal
        isOpen={isOfflineInfoOpen}
        onClose={() => setIsOfflineInfoOpen(false)}
        title="Офлайн-запись"
        phone={doctor.contacts?.phone}
        email={doctor.contacts?.email}
      />
    </main>
  );
};
