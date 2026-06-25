"use client";

import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  GitBranch,
  LayoutPanelLeft,
  LifeBuoy,
  MessageSquareText,
  MousePointerClick,
  Send,
  ShoppingBag,
  Sparkles,
  Wand2,
} from "lucide-react";
import { domAnimation, LazyMotion, m } from "motion/react";
import Link from "next/link";
import type { ComponentType } from "react";

import { HeroPreview } from "@/app/_landing/hero-preview";
import { BetaBadge } from "@/components/ui/beta-badge";
import { formatBetaSeatsLabel } from "@/lib/beta";
import { Button } from "@/components/ui/button";
import { GradientText } from "@/components/ui/gradient-text";
import { duration, fadeUp, gentleEase, scaleIn, staggerContainer, staggerItem } from "@/lib/motion";

type Item = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  text: string;
  accent: string;
};

const STEPS: Item[] = [
  {
    icon: MessageSquareText,
    title: "Опишите словами",
    text: "«Бот для записи в барбершоп с напоминаниями».",
    accent: "bg-sky-500/10 text-sky-500",
  },
  {
    icon: Sparkles,
    title: "ИИ собирает поток",
    text: "Сообщения, кнопки, условия, заявки и оплата.",
    accent: "bg-violet-500/10 text-violet-500",
  },
  {
    icon: Send,
    title: "Запуск в Telegram",
    text: "Подключили токен, и бот работает.",
    accent: "bg-emerald-500/10 text-emerald-500",
  },
];

const FEATURES: Item[] = [
  {
    icon: Wand2,
    title: "Генерация по описанию",
    text: "Создаёт и правит сценарий из текста.",
    accent: "bg-violet-500/10 text-violet-500",
  },
  {
    icon: LayoutPanelLeft,
    title: "Визуальный холст",
    text: "Вся логика наглядно, правки вручную.",
    accent: "bg-sky-500/10 text-sky-500",
  },
  {
    icon: BarChart3,
    title: "Заявки и аналитика",
    text: "Собирает лиды, отвечает на вопросы на русском.",
    accent: "bg-amber-500/10 text-amber-500",
  },
  {
    icon: CreditCard,
    title: "Приём платежей",
    text: "Оплата прямо в боте через ЮKassa.",
    accent: "bg-emerald-500/10 text-emerald-500",
  },
  {
    icon: GitBranch,
    title: "Ветвления и переменные",
    text: "Условия, ожидание ввода, расписания.",
    accent: "bg-rose-500/10 text-rose-500",
  },
  {
    icon: MousePointerClick,
    title: "Без кода",
    text: "Никаких серверов, всё в браузере.",
    accent: "bg-cyan-500/10 text-cyan-500",
  },
];

const USE_CASES: Item[] = [
  {
    icon: CalendarCheck,
    title: "Запись и услуги",
    text: "Барбершоп, салон, репетитор. Слоты, напоминания, оплата.",
    accent: "bg-emerald-500/10 text-emerald-500",
  },
  {
    icon: ShoppingBag,
    title: "Магазин и заказы",
    text: "Каталог, корзина, приём оплаты через ЮKassa.",
    accent: "bg-violet-500/10 text-violet-500",
  },
  {
    icon: LifeBuoy,
    title: "Поддержка и FAQ",
    text: "Отвечает на вопросы и передаёт сложное оператору.",
    accent: "bg-sky-500/10 text-sky-500",
  },
  {
    icon: ClipboardList,
    title: "Сбор заявок и лидов",
    text: "Анкеты, квизы, заявки складываются в базу.",
    accent: "bg-amber-500/10 text-amber-500",
  },
];

const FAQ = [
  {
    q: "Нужно ли уметь программировать?",
    a: "Нет. Описываете бота обычными словами, сценарий собирает ИИ.",
  },
  { q: "Сколько стоит?", a: "Сейчас открытая бета — бесплатно и без ограничений." },
  { q: "Где работает бот?", a: "В Telegram. Подключаете токен от @BotFather за минуту." },
  { q: "Можно принимать оплату?", a: "Да, через ЮKassa прямо внутри бота." },
  {
    q: "Какие боты можно собрать?",
    a: "Запись, магазины, поддержка, сбор заявок, рассылки, оплаты.",
  },
  { q: "Безопасны ли данные?", a: "Токены и секреты шифруются, у каждого проекта они свои." },
];

const viewport = { once: true, amount: 0.3 } as const;

export function LandingContent({ maxBetaUsers }: { maxBetaUsers: number }) {
  const betaSeatsLabel = formatBetaSeatsLabel(maxBetaUsers);
  const limitedBeta = maxBetaUsers > 0;
  return (
    <LazyMotion features={domAnimation}>
      <div className="relative min-h-svh overflow-hidden bg-background text-foreground">
        {/* Фоновые свечения */}
        <div
          aria-hidden="true"
          className="-z-10 pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="-top-40 -translate-x-1/2 absolute left-1/2 size-[640px] rounded-full bg-primary/10 blur-[120px]" />
          <div className="absolute top-[40%] right-0 size-[420px] rounded-full bg-sky-500/10 blur-[120px]" />
          <div className="absolute bottom-0 left-0 size-[420px] rounded-full bg-violet-500/10 blur-[120px]" />
        </div>

        <m.header
          initial="initial"
          animate="animate"
          variants={fadeUp}
          transition={{ duration: duration.normal, ease: gentleEase }}
          className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5"
        >
          <GradientText className="font-semibold text-lg tracking-tight">asce</GradientText>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Войти</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Регистрация</Link>
            </Button>
          </div>
        </m.header>

        <main className="mx-auto w-full max-w-6xl px-5">
          {/* Hero */}
          <section className="grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-2">
            <m.div
              initial="initial"
              animate="animate"
              variants={staggerContainer}
              className="flex flex-col items-start gap-6"
            >
              <m.div variants={staggerItem}>
                <BetaBadge>Открытая бета · бесплатно · {betaSeatsLabel}</BetaBadge>
              </m.div>
              <m.h1
                variants={staggerItem}
                className="text-balance font-semibold text-4xl leading-[1.1] tracking-tight sm:text-5xl"
              >
                Telegram-боты <GradientText>без кода</GradientText>. Опишите словами.
              </m.h1>
              <m.p
                variants={staggerItem}
                className="max-w-md text-balance text-muted-foreground sm:text-lg"
              >
                ИИ соберёт рабочий сценарий за минуты. Правки обычным текстом.
              </m.p>
              <m.div variants={staggerItem} className="flex flex-col gap-3 sm:flex-row">
                <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button asChild size="lg">
                    <Link href="/register">Начать бесплатно</Link>
                  </Button>
                </m.div>
                <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button asChild variant="outline" size="lg">
                    <Link href="#how">Как это работает</Link>
                  </Button>
                </m.div>
              </m.div>
            </m.div>

            <m.div
              initial="initial"
              animate="animate"
              variants={scaleIn}
              transition={{ duration: duration.slow, ease: gentleEase, delay: 0.15 }}
            >
              <HeroPreview />
            </m.div>
          </section>

          {/* Как это работает */}
          <Section id="how" eyebrow="Процесс" title="Как это работает">
            <m.ol
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={viewport}
              className="grid gap-5 sm:grid-cols-3"
            >
              {STEPS.map((step, index) => (
                <m.li
                  key={step.title}
                  variants={staggerItem}
                  whileHover={{ y: -6 }}
                  className="group relative overflow-hidden rounded-2xl bg-card/70 p-6 ring-1 ring-foreground/10 backdrop-blur transition-shadow hover:shadow-xl"
                >
                  <span className="pointer-events-none absolute top-3 right-4 font-semibold text-7xl text-foreground/[0.04] tabular-nums">
                    {index + 1}
                  </span>
                  <Tile icon={step.icon} accent={step.accent} />
                  <div className="mt-4 font-medium text-lg">{step.title}</div>
                  <p className="mt-1 text-muted-foreground text-sm">{step.text}</p>
                </m.li>
              ))}
            </m.ol>
          </Section>

          {/* Что умеет */}
          <Section eyebrow="Возможности" title="Что умеет">
            <m.div
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={viewport}
              className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {FEATURES.map((feature) => (
                <m.div
                  key={feature.title}
                  variants={staggerItem}
                  whileHover={{ y: -6 }}
                  className="group relative overflow-hidden rounded-2xl bg-card/70 p-6 ring-1 ring-foreground/10 backdrop-blur transition-shadow hover:shadow-xl"
                >
                  <Tile icon={feature.icon} accent={feature.accent} />
                  <div className="mt-4 font-medium text-lg">{feature.title}</div>
                  <p className="mt-1 text-muted-foreground text-sm">{feature.text}</p>
                </m.div>
              ))}
            </m.div>
          </Section>

          {/* Примеры ботов */}
          <Section eyebrow="Примеры" title="Каких ботов собирают">
            <m.div
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={viewport}
              className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
            >
              {USE_CASES.map((useCase) => (
                <m.div
                  key={useCase.title}
                  variants={staggerItem}
                  whileHover={{ y: -6 }}
                  className="group relative overflow-hidden rounded-2xl bg-card/70 p-6 ring-1 ring-foreground/10 backdrop-blur transition-shadow hover:shadow-xl"
                >
                  <Tile icon={useCase.icon} accent={useCase.accent} />
                  <div className="mt-4 font-medium text-lg">{useCase.title}</div>
                  <p className="mt-1 text-muted-foreground text-sm">{useCase.text}</p>
                </m.div>
              ))}
            </m.div>
          </Section>

          {/* FAQ */}
          <Section eyebrow="Вопросы" title="Частые вопросы">
            <m.div
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={viewport}
              className="grid gap-4 sm:grid-cols-2"
            >
              {FAQ.map((item) => (
                <m.div
                  key={item.q}
                  variants={staggerItem}
                  className="rounded-2xl bg-card/70 p-5 ring-1 ring-foreground/10 backdrop-blur"
                >
                  <div className="font-medium">{item.q}</div>
                  <p className="mt-1.5 text-muted-foreground text-sm">{item.a}</p>
                </m.div>
              ))}
            </m.div>
          </Section>

          {/* Бета CTA */}
          <m.section
            initial="initial"
            whileInView="animate"
            viewport={viewport}
            variants={scaleIn}
            transition={{ duration: duration.normal, ease: gentleEase }}
            className="relative my-16 flex flex-col items-center gap-5 overflow-hidden rounded-3xl border border-foreground/10 bg-gradient-to-b from-card/80 to-card/40 px-6 py-16 text-center backdrop-blur"
          >
            <div
              aria-hidden="true"
              className="-z-10 -translate-x-1/2 pointer-events-none absolute top-0 left-1/2 size-[420px] rounded-full bg-primary/15 blur-[100px]"
            />
            <BetaBadge>{limitedBeta ? "Идёт набор в бету" : "Открытая бета"}</BetaBadge>
            <h2 className="max-w-xl text-balance font-semibold text-3xl sm:text-4xl">
              {limitedBeta ? (
                <>
                  Ограниченный доступ: <GradientText>{betaSeatsLabel}</GradientText>
                </>
              ) : (
                <>
                  <GradientText>Без ограничений</GradientText> на период бета-теста
                </>
              )}
            </h2>
            <p className="max-w-md text-muted-foreground">
              {limitedBeta
                ? "Сейчас открыт бесплатный бета-тест. Места ограничены, чтобы держать качество и скорость. Когда набор закроется, попадёте в лист ожидания."
                : "Сейчас открытая бета: все возможности платформы доступны бесплатно, без лимитов на ИИ и количество ботов."}
            </p>
            <m.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button asChild size="lg">
                <Link href="/register">{limitedBeta ? "Занять место" : "Начать бесплатно"}</Link>
              </Button>
            </m.div>
          </m.section>
        </main>

        <footer className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-5 py-8 text-muted-foreground text-sm sm:flex-row">
          <span>© {new Date().getFullYear()} asce</span>
          <div className="flex items-center gap-4">
            <span>asce.tech</span>
            <a href="mailto:hello@asce.tech" className="transition-colors hover:text-foreground">
              hello@asce.tech
            </a>
          </div>
        </footer>
      </div>
    </LazyMotion>
  );
}

function Tile({
  icon: Icon,
  accent,
}: {
  icon: ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <span
      className={`flex size-11 items-center justify-center rounded-xl ${accent} transition-transform duration-200 group-hover:scale-110`}
    >
      <Icon className="size-5" />
    </span>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="py-14">
      <m.div
        initial="initial"
        whileInView="animate"
        viewport={viewport}
        variants={fadeUp}
        transition={{ duration: duration.normal, ease: gentleEase }}
        className="mb-10 flex flex-col items-center gap-2 text-center"
      >
        <span className="font-medium text-primary text-xs uppercase tracking-widest">
          {eyebrow}
        </span>
        <h2 className="font-semibold text-3xl tracking-tight">{title}</h2>
      </m.div>
      {children}
    </section>
  );
}
