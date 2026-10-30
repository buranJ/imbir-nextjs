"use client";

import { FC } from "react";

import { StaticImageData } from "next/image";
import Link from "next/link";

import { HeartIcon, HeartIcon2, StarIcon } from "@/shared/assets/icons";
import { ROUTES } from "@/shared/config";
import { formatDuration, hasDuration } from "@/shared/lib/duration";
import { hasPrice } from "@/shared/lib/price";
import { formatRating } from "@/shared/lib/utils";
import { useAuthStore } from "@/shared/store";
import { Button, ImageWithFallback, Spinner } from "@/shared/ui";

type Props = {
  category: string;
  clinic?: string;
  clinicId?: string;
  // Минуты; не указана — строку не рисуем.
  duration?: null | number;
  // Куда ведёт карточка. По умолчанию — запись на услугу (?service=id); на
  // странице врача вместе с ней передаём и самого врача.
  href?: string;
  id?: string;
  image?: StaticImageData | string;
  // Запрос по этой карточке уже летит — показываем спиннер вместо сердца и
  // гасим клики, чтобы повторный тап не ушёл ещё одним запросом.
  isPending?: boolean;
  isSaved?: boolean;
  name: string;
  onBook?: () => void;
  onSave?: () => void;
  price?: null | number | string;
  // Ставим на первую карточку списка — её фото и есть LCP-элемент страницы.
  priority?: boolean;
  // Рейтинга может не быть (например, у услуги из избранного) — тогда строку
  // с оценкой не рисуем вовсе, а не показываем «0 (0)».
  rating?: number;
  reviews?: number;
  variant?: "horizontal" | "vertical";
};

const SaveButton: FC<{
  isPending?: boolean;
  isSaved: boolean;
  onSave?: () => void;
}> = ({ isSaved, isPending = false, onSave }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSave?.();
  };

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      aria-busy={isPending || undefined}
      className="w-12 h-12 rounded-full bg-white flex items-center justify-center hover:bg-surface transition-colors shadow-sm shrink-0 disabled:opacity-70 disabled:pointer-events-none"
      aria-label={isSaved ? "Удалить из избранного" : "Добавить в избранное"}
    >
      {isPending ? (
        <Spinner className="w-5 h-5 text-primary" />
      ) : isSaved ? (
        <HeartIcon2 className="w-6 h-6 text-primary" />
      ) : (
        <HeartIcon className="w-6 h-6 text-primary" />
      )}
    </button>
  );
};

export const ServiceCard: FC<Props> = ({
  id,
  name,
  category,
  clinic,
  clinicId,
  duration,
  href: hrefProp,
  rating,
  reviews,
  price,
  image,
  onBook,
  onSave,
  isSaved = false,
  isPending = false,
  priority = false,
  variant = "vertical",
}) => {
  // Клиники может не быть в данных (напр. в избранном) — не подписываем
  // «Клиника не указана», а просто опускаем строку.
  const displayClinic = clinic || clinicId;
  // Цену прячем целиком, если бэк её не отдал — «0 с» читалось бы как «бесплатно»
  const showPrice = hasPrice(price);
  const showDuration = hasDuration(duration);
  // Ровно та же логика для оценки: «0.00 (0)» у новой услуги читается как
  // плохая оценка, хотя её просто ещё никто не оценивал.
  const hasRating = reviews !== undefined && reviews > 0;
  const user = useAuthStore((s) => s.user);
  const isDoctor = user?.role === "doctor";
  const href =
    hrefProp ?? (id ? `${ROUTES.RECORD}?service=${id}` : ROUTES.RECORD);
  const stopProp = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  // Кнопка лежит внутри Link на форму записи (?service=id). Своим onBook
  // событие гасим, чтобы не было двойной навигации, а без него гасить нечего:
  // preventDefault отменял переход по карточке и «Записаться» не делала ничего.
  const handleBook = (e: React.MouseEvent) => {
    if (!onBook) return;
    stopProp(e);
    onBook();
  };

  if (variant === "horizontal") {
    return (
      <Link
        href={href}
        className="bg-white rounded-3xl p-4 flex items-center gap-4 border border-border cursor-pointer hover:border-primary/40 transition-colors"
      >
        <div className="relative w-28 h-28 rounded-2xl overflow-hidden bg-[#FFF2F0] flex items-center justify-center shrink-0">
          <ImageWithFallback
            src={image}
            alt={name}
            fill
            priority={priority}
            sizes="112px"
            className="object-cover"
            fallback={
              <span className="text-primary text-2xl font-bold uppercase">
                {name.slice(0, 2)}
              </span>
            }
          />
        </div>

        <div className="flex-1 min-w-0 flex flex-col self-stretch">
          <h3 className="text-foreground font-semibold text-base leading-snug line-clamp-2 mb-1">
            {name}
          </h3>

          <p className="text-muted text-xs mb-1">
            {category}
            {displayClinic && (
              <span className="text-primary"> • {displayClinic}</span>
            )}
          </p>

          {hasRating && (
            <div className="flex items-center gap-1 mb-2 text-xs">
              <StarIcon className="w-3.5 h-3.5 text-primary" />
              <span className="text-primary font-medium">
                {formatRating(rating ?? 0)}
              </span>
              <span className="text-secondary">({reviews})</span>
            </div>
          )}

          {/* flex-wrap обязателен: на 375px цена и пара «Записаться» + сердце
              не помещаются в одну строку рядом с картинкой 112px, и кнопка
              избранного вылезала за край карточки, растягивая всю страницу
              по горизонтали. */}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            {(showPrice || showDuration) && (
              <span className="flex items-baseline gap-2 whitespace-nowrap">
                {showPrice && (
                  <span className="text-foreground font-bold text-base">
                    {price} с
                  </span>
                )}
                {showDuration && (
                  <span className="text-muted text-xs">
                    {formatDuration(duration)}
                  </span>
                )}
              </span>
            )}
            <div className="flex items-center gap-2 ml-auto">
              {!isDoctor && (
                <Button
                  variant="outline"
                  size="xs"
                  className="px-4 py-1.5 justify-center text-xs"
                  onClick={handleBook}
                >
                  Записаться
                </Button>
              )}
              <SaveButton
                isSaved={isSaved}
                isPending={isPending}
                onSave={onSave}
              />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="bg-white rounded-3xl border border-border overflow-hidden flex flex-col h-full cursor-pointer hover:border-primary/40 transition-colors"
    >
      <div className="relative aspect-4/3 w-full">
        <ImageWithFallback
          src={image}
          alt={name}
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover"
          fallback={
            <div className="w-full h-full bg-[#FFF2F0] flex items-center justify-center">
              <span className="text-primary text-3xl font-bold uppercase">
                {name.slice(0, 2)}
              </span>
            </div>
          }
        />
        <div className="absolute top-4 right-4 z-10">
          <SaveButton isSaved={isSaved} isPending={isPending} onSave={onSave} />
        </div>
      </div>

      <div className="flex-1 p-4 flex flex-col">
        <p className="text-muted text-xs mb-1 uppercase tracking-wider">
          {category}
        </p>

        <h3 className="text-foreground font-semibold text-base leading-snug mb-1 line-clamp-2">
          {name}
        </h3>

        {displayClinic && (
          <p className="text-secondary text-xs mb-3 truncate">
            {displayClinic}
          </p>
        )}

        {hasRating && (
          <div className="flex items-center gap-1 mb-4 text-sm">
            <StarIcon className="w-3.5 h-3.5 text-primary" />
            <span className="text-primary font-medium">
              {formatRating(rating ?? 0)}
            </span>
            <span className="text-secondary">({reviews})</span>
          </div>
        )}

        <div className="mt-auto pt-3 flex items-center justify-between gap-3 border-t border-border-soft">
          {(showPrice || showDuration) && (
            <span className="flex items-baseline gap-2 whitespace-nowrap">
              {showPrice && (
                <span className="text-foreground font-bold text-lg">
                  {price} с
                </span>
              )}
              {showDuration && (
                <span className="text-muted text-sm">
                  {formatDuration(duration)}
                </span>
              )}
            </span>
          )}
          {!isDoctor && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-center"
              onClick={handleBook}
            >
              Записаться
            </Button>
          )}
        </div>
      </div>
    </Link>
  );
};
