import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Icon } from "./icons"
import type { IconName } from "./icons"

type Tab = "home" | "health" | "meds" | "alerts" | "profile"
type MetricKey = "bp" | "glucose" | "hr" | "spo2" | "temp" | "weight"
type Tone = "ok" | "warn" | "bad" | "muted"
type MedStatus = "taken" | "pending" | "missed"

/* ---------- Dữ liệu minh họa ---------- */

const METRICS: Record<
  MetricKey,
  {
    label: string
    unit: string
    icon: IconName
    bg: string
    fg: string
    decimals: number
    range: string
  }
> = {
  bp: {
    label: "Huyết áp",
    unit: "mmHg",
    icon: "gauge",
    bg: "bg-[#E1EFFB]",
    fg: "text-[#2A74B8]",
    decimals: 0,
    range: "Bình thường: dưới 130/85 mmHg",
  },
  glucose: {
    label: "Đường huyết",
    unit: "mg/dL",
    icon: "drop",
    bg: "bg-[#FDEBD2]",
    fg: "text-[#C9741A]",
    decimals: 0,
    range: "Lúc đói bình thường: 70–125 mg/dL",
  },
  hr: {
    label: "Nhịp tim",
    unit: "bpm",
    icon: "heartpulse",
    bg: "bg-[#DDF3E8]",
    fg: "text-[#1C8560]",
    decimals: 0,
    range: "Khi nghỉ ngơi bình thường: 60–100 bpm",
  },
  spo2: {
    label: "SpO₂",
    unit: "%",
    icon: "lungs",
    bg: "bg-[#FCE3EB]",
    fg: "text-[#C8416F]",
    decimals: 0,
    range: "Nồng độ oxy bình thường: từ 95% trở lên",
  },
  temp: {
    label: "Nhiệt độ",
    unit: "°C",
    icon: "thermo",
    bg: "bg-[#ECE5FA]",
    fg: "text-[#6B4BBA]",
    decimals: 1,
    range: "Nhiệt độ bình thường: 36.1–37.5°C",
  },
  weight: {
    label: "Cân nặng",
    unit: "kg",
    icon: "scale",
    bg: "bg-[#FFF1BF]",
    fg: "text-[#9C7600]",
    decimals: 1,
    range: "Cân nặng được đánh giá cùng chỉ số BMI",
  },
}

const METRIC_ORDER: MetricKey[] = ["bp", "glucose", "hr", "spo2", "temp", "weight"]

type Series = Record<MetricKey, number[]> & { dia: number[] }

const INITIAL_SERIES: Series = {
  bp: [124, 128, 122, 126, 119, 123, 120],
  dia: [82, 84, 80, 83, 79, 81, 80],
  glucose: [112, 108, 118, 104, 110, 101, 105],
  hr: [78, 74, 72, 80, 76, 73, 75],
  spo2: [97, 98, 97, 96, 98, 97, 98],
  temp: [36.5, 36.6, 36.4, 36.8, 36.6, 36.5, 36.7],
  weight: [62.4, 62.3, 62.3, 62.1, 62.2, 62.0, 62.0],
}

const CHART_DAYS = ["T6", "T7", "CN", "T2", "T3", "T4", "T5"]
const HISTORY_DAYS = [
  "Thứ 6, 16/10",
  "Thứ 7, 17/10",
  "Chủ nhật, 18/10",
  "Thứ 2, 19/10",
  "Thứ 3, 20/10",
  "Thứ 4, 21/10",
  "Hôm nay, 22/10",
]

interface Med {
  id: number
  name: string
  dose: string
  time: string
  note: string
  status: MedStatus
  takenAt?: string
}

const INITIAL_MEDS: Med[] = [
  {
    id: 1,
    name: "Amlodipine",
    dose: "1 viên · 5 mg",
    time: "07:00",
    note: "Uống sau bữa sáng",
    status: "taken",
    takenAt: "07:05",
  },
  {
    id: 2,
    name: "Metformin",
    dose: "1 viên · 500 mg",
    time: "08:30",
    note: "Uống cùng bữa ăn",
    status: "missed",
  },
  {
    id: 3,
    name: "Atorvastatin",
    dose: "1 viên · 10 mg",
    time: "12:30",
    note: "Uống sau bữa trưa",
    status: "pending",
  },
  {
    id: 4,
    name: "Vitamin D3",
    dose: "1 viên · 1000 IU",
    time: "20:00",
    note: "Uống sau bữa tối",
    status: "pending",
  },
]

const MED_STATUS: Record<MedStatus, { label: string; tone: Tone }> = {
  taken: { label: "Đã uống", tone: "ok" },
  pending: { label: "Chưa uống", tone: "warn" },
  missed: { label: "Bỏ lỡ", tone: "bad" },
}

const CONTACTS = [
  { name: "Nguyễn Minh Tuấn", role: "Con trai", phone: "0912 345 678" },
  { name: "Trần Thu Hà", role: "Con dâu", phone: "0987 654 321" },
  { name: "BS. Lê Hoàng Nam", role: "Bác sĩ gia đình", phone: "0903 111 222" },
]

const WEEK = [
  { d: "T3", n: 20 },
  { d: "T4", n: 21 },
  { d: "T5", n: 22 },
  { d: "T6", n: 23 },
  { d: "T7", n: 24 },
  { d: "CN", n: 25 },
  { d: "T2", n: 26 },
]

/* ---------- Hàm hỗ trợ ---------- */

const fmt = (key: MetricKey, v: number) => v.toFixed(METRICS[key].decimals)

function statusOf(key: MetricKey, v: number, d = 0): { label: string; tone: Tone } {
  switch (key) {
    case "bp":
      if (v >= 140 || d >= 90) return { label: "Cao", tone: "bad" }
      if (v >= 130 || d >= 85) return { label: "Hơi cao", tone: "warn" }
      if (v < 90 || d < 60) return { label: "Thấp", tone: "warn" }
      return { label: "Bình thường", tone: "ok" }
    case "glucose":
      if (v > 140 || v < 70) return { label: "Cần chú ý", tone: "warn" }
      return { label: "Đã cập nhật", tone: "ok" }
    case "hr":
      if (v > 100 || v < 60) return { label: "Cần chú ý", tone: "warn" }
      return { label: "Bình thường", tone: "ok" }
    case "spo2":
      if (v < 92) return { label: "Thấp", tone: "bad" }
      if (v < 95) return { label: "Hơi thấp", tone: "warn" }
      return { label: "Bình thường", tone: "ok" }
    case "temp":
      if (v > 37.5) return { label: "Hơi sốt", tone: "warn" }
      if (v < 36) return { label: "Hơi thấp", tone: "warn" }
      return { label: "Bình thường", tone: "ok" }
    default:
      return { label: "Đã cập nhật", tone: "ok" }
  }
}

const bmiOf = (weight: number, heightCm: number) =>
  heightCm > 0 ? weight / Math.pow(heightCm / 100, 2) : null

const TONE: Record<Tone, string> = {
  ok: "bg-[#DDF3E8] text-[#146B4D]",
  warn: "bg-[#FDF0D8] text-[#8A5200]",
  bad: "bg-[#FBE3E3] text-[#A81F1F]",
  muted: "bg-[#EEF2EF] text-[#4F5E56]",
}

const DOT: Record<Tone, string> = {
  ok: "bg-brand",
  warn: "bg-warn",
  bad: "bg-sos",
  muted: "bg-sub",
}

/* ---------- Thành phần dùng chung ---------- */

function Pill({
  tone,
  children,
  icon,
}: {
  tone: Tone
  children: ReactNode
  icon?: IconName
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-semibold leading-none ${TONE[tone]}`}
    >
      {icon ? (
        <Icon name={icon} size={15} stroke={2.4} />
      ) : (
        <span className={`h-2 w-2 rounded-full ${DOT[tone]}`} />
      )}
      {children}
    </span>
  )
}

function ScreenHeader({
  title,
  subtitle,
  tone = "green",
  children,
}: {
  title: string
  subtitle?: string
  tone?: "green" | "red"
  children?: ReactNode
}) {
  return (
    <header
      className={`relative overflow-hidden rounded-b-[32px] px-5 pb-6 pt-8 text-white ${
        tone === "green"
          ? "bg-[linear-gradient(135deg,#155E4B_0%,#1B7A5D_100%)]"
          : "bg-[linear-gradient(135deg,#9E2020_0%,#C62828_100%)]"
      }`}
    >
      <span className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/[0.06]" />
      <span className="pointer-events-none absolute right-12 top-16 h-20 w-20 rounded-full bg-white/[0.05]" />
      <h1 className="relative text-[26px] font-bold leading-tight">{title}</h1>
      {subtitle && (
        <p className="relative mt-1 text-[16px] text-white/80">{subtitle}</p>
      )}
      {children}
    </header>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[22px] font-bold leading-snug text-ink">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[16px] text-sub">{subtitle}</p>}
    </div>
  )
}

function Trend({ a, b, color }: { a: number[]; b?: number[]; color: string }) {
  const W = 300
  const H = 130
  const padY = 16
  const all = [...a, ...(b ?? [])]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const x = (i: number) => ((i + 0.5) * W) / 7
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2)
  const line = (s: number[]) => s.map((v, i) => `${x(i)},${y(v)}`).join(" L")
  const last = a.length - 1

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Biểu đồ xu hướng 7 ngày"
      >
        {[0.15, 0.5, 0.85].map((t) => (
          <line
            key={t}
            x1="0"
            x2={W}
            y1={H * t}
            y2={H * t}
            stroke="#E1EBE5"
            strokeDasharray="3 5"
          />
        ))}
        {!b && (
          <path
            d={`M${line(a)} L${x(last)},${H} L${x(0)},${H} Z`}
            fill={color}
            opacity="0.12"
          />
        )}
        {b && (
          <path
            d={`M${line(b)}`}
            fill="none"
            stroke={color}
            strokeOpacity="0.4"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        <path
          d={`M${line(a)}`}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {a.map((v, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={i === last ? 6.5 : 4}
            fill={i === last ? color : "#fff"}
            stroke={color}
            strokeWidth="2.5"
          />
        ))}
      </svg>
      <div className="mt-1 grid grid-cols-7 text-center text-[14px] font-medium text-sub">
        {CHART_DAYS.map((d, i) => (
          <span key={d} className={i === last ? "font-bold text-ink" : ""}>
            {i === last ? "Nay" : d}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------- Màn hình: Trang chủ ---------- */

function HomeScreen({
  series,
  height,
  meds,
  go,
  openMetric,
}: {
  series: Series
  height: number
  meds: Med[]
  go: (t: Tab) => void
  openMetric: (k: MetricKey) => void
}) {
  const quick: {
    label: string
    icon: IconName | "sos"
    bg: string
    fg: string
    tab: Tab
  }[] = [
    { label: "Hồ sơ", icon: "idcard", bg: "bg-mint", fg: "text-brand", tab: "profile" },
    { label: "Sức khỏe", icon: "activity", bg: "bg-[#E1EFFB]", fg: "text-[#2A74B8]", tab: "health" },
    { label: "Lịch thuốc", icon: "pill", bg: "bg-[#ECE5FA]", fg: "text-[#6B4BBA]", tab: "meds" },
    { label: "SOS", icon: "sos", bg: "bg-[#FBE3E3]", fg: "text-sos", tab: "alerts" },
  ]
  const taken = meds.filter((m) => m.status === "taken").length
  const last = (k: MetricKey) => series[k][6]
  const bmi = bmiOf(last("weight"), height)

  const valueOf = (k: MetricKey) =>
    k === "bp" ? `${last("bp")}/${series.dia[6]}` : fmt(k, last(k))

  return (
    <div className="screen-enter">
      <header className="relative overflow-hidden rounded-b-[32px] bg-[linear-gradient(135deg,#155E4B_0%,#1B7A5D_100%)] px-5 pb-16 pt-8 text-white">
        <span className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-white/[0.06]" />
        <span className="pointer-events-none absolute right-16 top-20 h-24 w-24 rounded-full bg-white/[0.05]" />
        <div className="relative flex items-center gap-3.5">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#E8F6EF] text-[20px] font-bold text-deep ring-4 ring-white/25">
            AN
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] text-white/80">Chào buổi sáng!</p>
            <p className="truncate text-[24px] font-bold leading-tight">Nguyễn Văn An</p>
          </div>
          <button
            aria-label="Thông báo, có 2 thông báo mới"
            className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/15 transition active:bg-white/25"
          >
            <Icon name="bell" size={24} />
            <span className="absolute right-3 top-3 h-3 w-3 rounded-full border-2 border-[#1a6f58] bg-warn" />
          </button>
        </div>
        <div className="relative mt-5 flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-white/15 px-3.5 py-2 text-[15px] font-semibold">
            75 tuổi
          </span>
          <span className="flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-2 text-[15px] font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-[#7DE0B4] shadow-[0_0_0_4px_rgba(125,224,180,.25)]" />
            Đang theo dõi sức khỏe
          </span>
        </div>
      </header>

      <div className="relative z-10 -mt-11 px-5">
        <nav
          aria-label="Chức năng nhanh"
          className="grid grid-cols-4 gap-1 rounded-[24px] border border-line bg-white p-2.5 shadow-[0_10px_28px_rgba(21,94,75,.12)]"
        >
          {quick.map((q) => (
            <button
              key={q.label}
              onClick={() => go(q.tab)}
              className="flex min-h-[48px] flex-col items-center gap-2 rounded-2xl px-1 py-2 transition active:bg-canvas"
            >
              <span
                className={`grid h-14 w-14 place-items-center rounded-[18px] ${q.bg} ${q.fg}`}
              >
                {q.icon === "sos" ? (
                  <span className="text-[16px] font-extrabold tracking-wide">SOS</span>
                ) : (
                  <Icon name={q.icon} size={26} />
                )}
              </span>
              <span
                className={`text-[15px] font-semibold ${q.icon === "sos" ? "text-sos" : "text-ink"}`}
              >
                {q.label}
              </span>
            </button>
          ))}
        </nav>
      </div>

      <section className="px-5 pt-8">
        <SectionTitle
          title="Chỉ số sức khỏe"
          subtitle="Theo dõi tình trạng sức khỏe của bạn"
        />
        <div className="grid grid-cols-2 gap-3">
          {METRIC_ORDER.map((k) => {
            const m = METRICS[k]
            const st =
              k === "weight"
                ? bmi
                  ? {
                      label: `BMI ${bmi.toFixed(1)}`,
                      tone: (bmi < 18.5 || bmi >= 25 ? "warn" : "ok") as Tone,
                    }
                  : { label: "Chưa có BMI", tone: "muted" as Tone }
                : statusOf(k, last(k), series.dia[6])
            return (
              <button
                key={k}
                onClick={() => openMetric(k)}
                className="flex min-h-[176px] flex-col rounded-[20px] border border-line bg-white p-4 text-left shadow-[0_2px_10px_rgba(21,94,75,.05)] transition active:scale-[0.98]"
              >
                <span
                  className={`grid h-12 w-12 place-items-center rounded-[16px] ${m.bg} ${m.fg}`}
                >
                  <Icon name={m.icon} size={26} />
                </span>
                <span className="mt-3 text-[16px] font-medium text-sub">
                  {k === "weight" ? "Cân nặng / BMI" : m.label}
                </span>
                <span className="mt-0.5 flex items-baseline gap-1.5">
                  <strong className="text-[28px] font-bold leading-none text-ink">
                    {valueOf(k)}
                  </strong>
                  <span className="text-[15px] font-medium text-sub">{m.unit}</span>
                </span>
                <span className="mt-auto pt-3">
                  <Pill tone={st.tone}>{st.label}</Pill>
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-[14px] text-sub">
          Số liệu trên chỉ là dữ liệu minh họa, không phải số đo thật.
        </p>
      </section>

      <section className="px-5 pt-8">
        <SectionTitle title="Lịch uống thuốc hôm nay" />
        <div className="rounded-[22px] border border-line bg-white p-4 shadow-[0_2px_10px_rgba(21,94,75,.05)]">
          <div className="flex items-center justify-between">
            <p className="text-[16px] font-semibold text-ink">
              Đã uống {taken}/{meds.length} loại thuốc
            </p>
            <span className="text-[16px] font-bold text-brand">
              {Math.round((taken / meds.length) * 100)}%
            </span>
          </div>
          <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-mint">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${(taken / meds.length) * 100}%` }}
            />
          </div>
          <ul className="mt-2 divide-y divide-line">
            {meds.slice(0, 3).map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3.5">
                <span className="grid h-12 w-16 shrink-0 place-items-center rounded-2xl bg-canvas text-[17px] font-bold tabular-nums text-deep">
                  {m.time}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-semibold text-ink">{m.name}</p>
                  <p className="truncate text-[15px] text-sub">{m.dose}</p>
                </div>
                <Pill tone={MED_STATUS[m.status].tone}>{MED_STATUS[m.status].label}</Pill>
              </li>
            ))}
          </ul>
          <button
            onClick={() => go("meds")}
            className="mt-1 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[17px] font-bold text-white transition active:bg-deep"
          >
            Xem lịch thuốc
            <Icon name="arrow" size={20} />
          </button>
        </div>
      </section>

      <section className="px-5 pb-8 pt-6">
        <button
          onClick={() => go("alerts")}
          className="flex w-full items-center gap-4 rounded-[22px] border border-[#F2CACA] bg-[#FFF5F5] p-4 text-left transition active:scale-[0.99]"
        >
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sos text-[16px] font-extrabold text-white shadow-[0_6px_16px_rgba(198,40,40,.3)]">
            SOS
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block text-[18px] font-bold leading-snug text-[#8F1D1D]">
              Bạn cần hỗ trợ khẩn cấp?
            </strong>
            <span className="text-[16px] text-[#7A4A4A]">Nhấn để mở chức năng SOS</span>
          </span>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-sos">
            <Icon name="arrow" size={22} />
          </span>
        </button>
      </section>
    </div>
  )
}

/* ---------- Màn hình: Sức khỏe ---------- */

function HealthScreen({
  series,
  height,
  metric,
  setMetric,
  onAdd,
}: {
  series: Series
  height: number
  metric: MetricKey
  setMetric: (k: MetricKey) => void
  onAdd: () => void
}) {
  const m = METRICS[metric]
  const a = series[metric]
  const b = metric === "bp" ? series.dia : undefined
  const latest = a[6]
  const st = statusOf(metric, latest, series.dia[6])
  const valueText = b ? `${latest}/${b[6]}` : fmt(metric, latest)
  const avg = a.reduce((s, v) => s + v, 0) / a.length
  const bmi = metric === "weight" ? bmiOf(latest, height) : null
  const chartColor = { bp: "#2A74B8", glucose: "#D9822B", hr: "#21966F", spo2: "#D0507A", temp: "#7656C2", weight: "#B58A00" }[metric]

  return (
    <div className="screen-enter">
      <ScreenHeader title="Theo dõi sức khỏe" subtitle="Cập nhật lần cuối: hôm nay, 08:15" />

      <div className="no-scrollbar -mx-0 flex gap-2.5 overflow-x-auto px-5 pb-1 pt-5">
        {METRIC_ORDER.map((k) => {
          const active = k === metric
          return (
            <button
              key={k}
              onClick={() => setMetric(k)}
              aria-pressed={active}
              className={`flex h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-[16px] font-semibold transition ${
                active
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-white text-ink"
              }`}
            >
              <Icon name={METRICS[k].icon} size={20} />
              {METRICS[k].label}
            </button>
          )
        })}
      </div>

      <div className="space-y-4 px-5 pb-28 pt-4">
        <section className="rounded-[22px] border border-line bg-white p-5 shadow-[0_2px_10px_rgba(21,94,75,.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[16px] font-medium text-sub">Số đo mới nhất</p>
              <p className="mt-1 flex items-baseline gap-2">
                <strong className="text-[40px] font-bold leading-none text-ink">
                  {valueText}
                </strong>
                <span className="text-[18px] font-medium text-sub">{m.unit}</span>
              </p>
            </div>
            <span className={`grid h-14 w-14 place-items-center rounded-[18px] ${m.bg} ${m.fg}`}>
              <Icon name={m.icon} size={28} />
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Pill tone={st.tone}>{st.label}</Pill>
            {bmi && (
              <Pill tone={bmi < 18.5 || bmi >= 25 ? "warn" : "ok"}>BMI {bmi.toFixed(1)}</Pill>
            )}
            {metric === "weight" && !bmi && <Pill tone="muted">Chưa có chiều cao để tính BMI</Pill>}
          </div>
          <p className="mt-3 text-[16px] leading-relaxed text-sub">{m.range}</p>
        </section>

        <section className="rounded-[22px] border border-line bg-white p-5 shadow-[0_2px_10px_rgba(21,94,75,.05)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[20px] font-bold text-ink">Xu hướng 7 ngày</h2>
            <span className="text-[15px] font-medium text-sub">{m.unit}</span>
          </div>
          <Trend a={a} b={b} color={chartColor} />
          {b && (
            <div className="mt-3 flex gap-5 text-[15px] text-sub">
              <span className="flex items-center gap-2">
                <i className="h-1 w-5 rounded bg-[#2A74B8]" /> Số trên
              </span>
              <span className="flex items-center gap-2">
                <i className="h-1 w-5 rounded bg-[#2A74B8]/40" /> Số dưới
              </span>
            </div>
          )}
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
            {[
              ["Thấp nhất", Math.min(...a)],
              ["Trung bình", avg],
              ["Cao nhất", Math.max(...a)],
            ].map(([label, v]) => (
              <div key={label as string}>
                <p className="text-[14px] text-sub">{label as string}</p>
                <p className="mt-0.5 text-[20px] font-bold text-ink">
                  {(v as number).toFixed(m.decimals)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[22px] border border-line bg-white p-5 shadow-[0_2px_10px_rgba(21,94,75,.05)]">
          <h2 className="mb-1 text-[20px] font-bold text-ink">Lịch sử đo</h2>
          <ul className="divide-y divide-line">
            {[...HISTORY_DAYS]
              .map((d, i) => ({ d, i }))
              .reverse()
              .slice(0, 5)
              .map(({ d, i }) => {
                const s = statusOf(metric, a[i], series.dia[i])
                return (
                  <li key={d} className="flex min-h-[56px] items-center gap-3 py-2">
                    <span className={`h-3 w-3 shrink-0 rounded-full ${DOT[s.tone]}`} />
                    <span className="flex-1 text-[16px] text-ink">{d}</span>
                    <strong className="text-[18px] font-bold text-ink">
                      {b ? `${a[i]}/${b[i]}` : fmt(metric, a[i])}
                    </strong>
                    <span className="w-14 text-[14px] text-sub">{m.unit}</span>
                  </li>
                )
              })}
          </ul>
        </section>
      </div>

      <div className="pointer-events-none sticky bottom-3 z-10 px-5">
        <button
          onClick={onAdd}
          className="pointer-events-auto flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[18px] font-bold text-white shadow-[0_10px_24px_rgba(33,150,111,.35)] transition active:bg-deep"
        >
          <Icon name="plus" size={22} stroke={2.4} />
          Thêm số đo {m.label.toLowerCase()}
        </button>
      </div>
    </div>
  )
}

function AddSheet({
  metric,
  onClose,
  onSave,
}: {
  metric: MetricKey
  onClose: () => void
  onSave: (v: number, d?: number) => void
}) {
  const m = METRICS[metric]
  const [v, setV] = useState("")
  const [d, setD] = useState("")
  const num = parseFloat(v.replace(",", "."))
  const den = parseFloat(d.replace(",", "."))
  const valid = num > 0 && (metric !== "bp" || den > 0)

  const input =
    "h-14 w-full rounded-2xl border-2 border-line bg-canvas px-4 text-[22px] font-bold text-ink placeholder:font-normal placeholder:text-[#9AA7A0] focus:border-brand focus:bg-white focus:outline-none"

  return (
    <div className="absolute inset-0 z-40 flex items-end" role="dialog" aria-modal="true">
      <button
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-[#0E1F18]/50"
      />
      <div className="sheet-enter relative w-full rounded-t-[28px] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3">
        <span className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-line" />
        <div className="flex items-center justify-between">
          <h2 className="text-[22px] font-bold text-ink">Thêm số đo {m.label.toLowerCase()}</h2>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="grid h-12 w-12 place-items-center rounded-full bg-canvas text-sub"
          >
            <Icon name="x" size={22} />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[16px] font-medium text-sub">
              {metric === "bp" ? "Số trên (tâm thu)" : `Giá trị (${m.unit})`}
            </span>
            <input
              autoFocus
              inputMode="decimal"
              value={v}
              onChange={(e) => setV(e.target.value)}
              placeholder={metric === "bp" ? "Ví dụ: 120" : "Nhập số đo"}
              className={input}
            />
          </label>
          {metric === "bp" && (
            <label className="block">
              <span className="mb-1.5 block text-[16px] font-medium text-sub">
                Số dưới (tâm trương)
              </span>
              <input
                inputMode="decimal"
                value={d}
                onChange={(e) => setD(e.target.value)}
                placeholder="Ví dụ: 80"
                className={input}
              />
            </label>
          )}
        </div>
        <button
          disabled={!valid}
          onClick={() => onSave(num, metric === "bp" ? den : undefined)}
          className="mt-5 h-14 w-full rounded-2xl bg-brand text-[18px] font-bold text-white transition active:bg-deep disabled:bg-[#BCD9CD]"
        >
          Lưu số đo
        </button>
      </div>
    </div>
  )
}

/* ---------- Màn hình: Lịch thuốc ---------- */

function MedsScreen({
  meds,
  confirm,
}: {
  meds: Med[]
  confirm: (id: number) => void
}) {
  const [day, setDay] = useState(2)
  const today = day === 2
  const past = day < 2
  const list: Med[] = today
    ? meds
    : meds.map((m) => ({
        ...m,
        status: past ? ("taken" as MedStatus) : ("pending" as MedStatus),
        takenAt: past ? m.time : undefined,
      }))
  const taken = list.filter((m) => m.status === "taken").length

  return (
    <div className="screen-enter">
      <ScreenHeader title="Lịch uống thuốc" subtitle="Tháng 10, 2026">
        <div className="no-scrollbar relative -mx-5 mt-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
          {WEEK.map((w, i) => {
            const active = i === day
            return (
              <button
                key={w.n}
                onClick={() => setDay(i)}
                aria-pressed={active}
                aria-label={`${w.d}, ngày ${w.n}${i === 2 ? ", hôm nay" : ""}`}
                className={`flex h-[78px] w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[20px] transition ${
                  active ? "bg-white text-deep" : "bg-white/12 text-white"
                }`}
              >
                <span className="text-[14px] font-medium opacity-80">{w.d}</span>
                <span className="text-[22px] font-bold leading-none">{w.n}</span>
                <span
                  className={`mt-1 h-1.5 w-1.5 rounded-full ${i === 2 ? (active ? "bg-brand" : "bg-white") : "bg-transparent"}`}
                />
              </button>
            )
          })}
        </div>
      </ScreenHeader>

      <div className="space-y-3.5 px-5 pb-8 pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[22px] font-bold text-ink">
            {today ? "Hôm nay" : past ? "Ngày đã qua" : "Lịch dự kiến"}
          </h2>
          <span className="rounded-full bg-mint px-3.5 py-1.5 text-[15px] font-semibold text-deep">
            {taken}/{list.length} đã uống
          </span>
        </div>

        {list.map((m) => {
          const st = MED_STATUS[m.status]
          return (
            <article
              key={m.id}
              className={`rounded-[22px] border bg-white p-4 shadow-[0_2px_10px_rgba(21,94,75,.05)] ${
                m.status === "missed" ? "border-[#F2CACA]" : "border-line"
              }`}
            >
              <div className="flex items-start gap-3.5">
                <span
                  className={`grid h-14 w-14 shrink-0 place-items-center rounded-[18px] ${
                    m.status === "taken" ? "bg-mint text-brand" : "bg-[#ECE5FA] text-[#6B4BBA]"
                  }`}
                >
                  <Icon name={m.status === "taken" ? "check" : "pill"} size={26} stroke={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[19px] font-bold leading-snug text-ink">{m.name}</h3>
                  <p className="text-[16px] text-sub">{m.dose}</p>
                </div>
                <Pill tone={st.tone}>{st.label}</Pill>
              </div>

              <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl bg-canvas px-4 py-3 text-[16px] text-ink">
                <span className="flex items-center gap-2 font-semibold">
                  <Icon name="clock" size={20} className="text-brand" /> {m.time}
                </span>
                <span className="text-sub">{m.note}</span>
              </div>
              <p className="mt-2.5 flex items-center gap-2 text-[15px] text-sub">
                <Icon name="bell" size={17} /> Nhắc nhở: bật, trước 10 phút
              </p>

              {today && m.status !== "taken" && (
                <button
                  onClick={() => confirm(m.id)}
                  className="mt-3.5 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[17px] font-bold text-white transition active:bg-deep"
                >
                  <Icon name="check" size={22} stroke={2.6} />
                  {m.status === "missed" ? "Xác nhận đã uống bù" : "Xác nhận đã uống"}
                </button>
              )}
              {m.status === "taken" && (
                <p className="mt-3.5 flex items-center gap-2 text-[16px] font-semibold text-[#146B4D]">
                  <Icon name="check" size={20} stroke={2.6} />
                  Đã xác nhận lúc {m.takenAt}
                </p>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Màn hình: SOS ---------- */

const HOLD_MS = 3000
const RING = 2 * Math.PI * 108

function SosScreen() {
  const [phase, setPhase] = useState<"idle" | "holding" | "early" | "active">("idle")
  const [progress, setProgress] = useState(0)
  const [sent, setSent] = useState(0)
  const phaseRef = useRef(phase)
  const raf = useRef(0)
  const startAt = useRef(0)

  const update = (p: typeof phase) => {
    phaseRef.current = p
    setPhase(p)
  }

  const begin = () => {
    if (phaseRef.current === "active" || phaseRef.current === "holding") return
    startAt.current = performance.now()
    update("holding")
    const tick = (t: number) => {
      const p = Math.min((t - startAt.current) / HOLD_MS, 1)
      setProgress(p)
      if (p >= 1) {
        update("active")
        return
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }

  const release = () => {
    if (phaseRef.current !== "holding") return
    cancelAnimationFrame(raf.current)
    setProgress(0)
    update("early")
  }

  const cancel = () => {
    setProgress(0)
    setSent(0)
    update("idle")
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  useEffect(() => {
    if (phase !== "active") return
    setSent(0)
    const timers = [1, 2, 3].map((n) => window.setTimeout(() => setSent(n), n * 900))
    return () => timers.forEach(window.clearTimeout)
  }, [phase])

  const secondsLeft = Math.max(1, Math.ceil((1 - progress) * (HOLD_MS / 1000)))

  return (
    <div className="screen-enter">
      <ScreenHeader
        tone="red"
        title="Cảnh báo khẩn cấp"
        subtitle="Gửi thông báo và vị trí đến người thân"
      />

      <div className="flex flex-col items-center px-5 pt-8">
        <div className="relative grid h-[240px] w-[240px] place-items-center">
          <svg viewBox="0 0 240 240" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="120" cy="120" r="108" fill="none" stroke="#F6D5D5" strokeWidth="9" />
            <circle
              cx="120"
              cy="120"
              r="108"
              fill="none"
              stroke="#C62828"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - progress)}
            />
          </svg>
          <button
            onPointerDown={begin}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault()
                begin()
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") release()
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Nút SOS. Nhấn và giữ 3 giây để gửi cảnh báo khẩn cấp"
            disabled={phase === "active"}
            style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
            className={`flex h-[188px] w-[188px] flex-col items-center justify-center rounded-full bg-sos text-white shadow-[0_14px_34px_rgba(198,40,40,.4)] transition-transform duration-200 ${
              phase === "idle" || phase === "early" ? "sos-pulse" : ""
            } ${phase === "holding" ? "scale-95" : ""}`}
          >
            {phase === "active" ? (
              <>
                <Icon name="check" size={64} stroke={2.6} />
                <span className="mt-1 text-[18px] font-bold">Đã gửi</span>
              </>
            ) : phase === "holding" ? (
              <>
                <span className="text-[64px] font-extrabold leading-none tabular-nums">
                  {secondsLeft}
                </span>
                <span className="mt-1 text-[16px] font-semibold">Tiếp tục giữ…</span>
              </>
            ) : (
              <>
                <span className="text-[50px] font-extrabold leading-none tracking-wide">SOS</span>
                <span className="mt-2 text-[16px] font-semibold text-white/90">Giữ 3 giây</span>
              </>
            )}
          </button>
        </div>

        <div aria-live="polite" className="mt-5 w-full text-center">
          {phase === "idle" && (
            <p className="text-[17px] leading-relaxed text-sub">
              Nhấn và <strong className="text-ink">giữ nút trong 3 giây</strong> để gửi cảnh báo.
              Chạm nhẹ sẽ không kích hoạt.
            </p>
          )}
          {phase === "holding" && (
            <p className="text-[17px] font-semibold text-sos">
              Đang giữ… thả tay để dừng lại.
            </p>
          )}
          {phase === "early" && (
            <p className="mx-auto rounded-2xl bg-[#FDF0D8] px-4 py-3 text-[16px] font-semibold text-[#8A5200]">
              Chưa gửi cảnh báo. Hãy giữ đủ 3 giây nếu bạn cần giúp đỡ.
            </p>
          )}
          {phase === "active" && (
            <div className="rounded-[22px] border border-[#F2CACA] bg-[#FFF5F5] p-4 text-left">
              <p className="text-[19px] font-bold text-[#8F1D1D]">Đã gửi cảnh báo khẩn cấp</p>
              <p className="mt-1 text-[16px] text-[#6E4545]">
                Vị trí của bạn đang được chia sẻ. Hãy giữ bình tĩnh, người thân sẽ liên lạc ngay.
              </p>
              <button
                onClick={cancel}
                className="mt-3.5 h-[52px] w-full rounded-2xl border-2 border-sos bg-white text-[17px] font-bold text-sos transition active:bg-[#FBE3E3]"
              >
                Tôi đã an toàn – Hủy cảnh báo
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="px-5 pb-8 pt-7">
        <SectionTitle title="Liên hệ khẩn cấp" subtitle="Người sẽ nhận cảnh báo của bạn" />
        <ul className="space-y-3">
          {CONTACTS.map((c, i) => (
            <li
              key={c.name}
              className="flex items-center gap-3.5 rounded-[20px] border border-line bg-white p-3.5 shadow-[0_2px_10px_rgba(21,94,75,.05)]"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-mint text-[17px] font-bold text-deep">
                {c.name.split(" ").slice(-1)[0][0]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold text-ink">{c.name}</p>
                <p className="text-[15px] text-sub">
                  {c.role} · {c.phone}
                </p>
                {phase === "active" && (
                  <p
                    className={`mt-0.5 text-[14px] font-semibold ${
                      sent > i ? "text-[#146B4D]" : "text-[#8A5200]"
                    }`}
                  >
                    {sent > i ? "Đã nhận cảnh báo" : "Đang gửi…"}
                  </p>
                )}
              </div>
              <a
                href={`tel:${c.phone.replace(/\s/g, "")}`}
                aria-label={`Gọi ${c.name}`}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand text-white transition active:bg-deep"
              >
                <Icon name="phone" size={22} />
              </a>
            </li>
          ))}
          <li>
            <a
              href="tel:115"
              className="flex min-h-[60px] items-center justify-center gap-2.5 rounded-[20px] bg-sos text-[18px] font-bold text-white transition active:bg-[#A82323]"
            >
              <Icon name="phone" size={22} />
              Gọi cấp cứu 115
            </a>
          </li>
        </ul>
      </section>
    </div>
  )
}

/* ---------- Màn hình: Hồ sơ ---------- */

interface Profile {
  name: string
  gender: string
  dob: string
  phone: string
  address: string
  height: string
}

function ProfileScreen({
  profile,
  setProfile,
}: {
  profile: Profile
  setProfile: (p: Profile) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile)

  const rows: { key: keyof Profile; label: string; icon: IconName; unit?: string }[] = [
    { key: "name", label: "Họ và tên", icon: "user" },
    { key: "gender", label: "Giới tính", icon: "idcard" },
    { key: "dob", label: "Ngày sinh", icon: "calendar" },
    { key: "phone", label: "Số điện thoại", icon: "phone" },
    { key: "address", label: "Địa chỉ", icon: "pin" },
    { key: "height", label: "Chiều cao", icon: "ruler", unit: "cm" },
  ]

  return (
    <div className="screen-enter">
      <header className="relative overflow-hidden rounded-b-[32px] bg-[linear-gradient(135deg,#155E4B_0%,#1B7A5D_100%)] px-5 pb-7 pt-8 text-center text-white">
        <span className="pointer-events-none absolute -left-10 -top-14 h-44 w-44 rounded-full bg-white/[0.06]" />
        <span className="pointer-events-none absolute -right-8 top-20 h-28 w-28 rounded-full bg-white/[0.05]" />
        <div className="relative mx-auto grid h-24 w-24 place-items-center rounded-full bg-[#E8F6EF] text-[32px] font-bold text-deep ring-[6px] ring-white/25">
          AN
        </div>
        <h1 className="relative mt-3 text-[26px] font-bold leading-tight">{profile.name}</h1>
        <p className="relative mt-1 text-[16px] text-white/80">75 tuổi · {profile.gender}</p>
      </header>

      <div className="space-y-4 px-5 pb-8 pt-5">
        <section className="rounded-[22px] border border-line bg-white px-4 py-1 shadow-[0_2px_10px_rgba(21,94,75,.05)]">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3.5 py-3.5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-mint text-brand">
                  <Icon name={r.icon} size={24} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-sub">{r.label}</p>
                  {editing ? (
                    r.key === "gender" ? (
                      <div className="mt-1 flex gap-2">
                        {["Nam", "Nữ"].map((g) => (
                          <button
                            key={g}
                            onClick={() => setDraft({ ...draft, gender: g })}
                            aria-pressed={draft.gender === g}
                            className={`h-12 flex-1 rounded-xl border-2 text-[17px] font-semibold ${
                              draft.gender === g
                                ? "border-brand bg-mint text-deep"
                                : "border-line bg-white text-ink"
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        value={draft[r.key]}
                        onChange={(e) => setDraft({ ...draft, [r.key]: e.target.value })}
                        inputMode={r.key === "phone" || r.key === "height" ? "numeric" : "text"}
                        className="mt-1 h-12 w-full rounded-xl border-2 border-line bg-canvas px-3 text-[17px] font-semibold text-ink focus:border-brand focus:bg-white focus:outline-none"
                      />
                    )
                  ) : (
                    <p className="text-[18px] font-semibold leading-snug text-ink">
                      {profile[r.key]}
                      {r.unit ? ` ${r.unit}` : ""}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {editing ? (
          <div className="flex gap-3">
            <button
              onClick={() => {
                setDraft(profile)
                setEditing(false)
              }}
              className="h-14 flex-1 rounded-2xl border-2 border-line bg-white text-[17px] font-bold text-ink"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                setProfile(draft)
                setEditing(false)
              }}
              className="h-14 flex-[1.4] rounded-2xl bg-brand text-[17px] font-bold text-white transition active:bg-deep"
            >
              Lưu thông tin
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setDraft(profile)
              setEditing(true)
            }}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-brand text-[17px] font-bold text-white transition active:bg-deep"
          >
            <Icon name="edit" size={21} />
            Chỉnh sửa thông tin cá nhân
          </button>
        )}

        <div className="flex items-start gap-3 rounded-[20px] bg-mint p-4 text-[16px] leading-relaxed text-deep">
          <Icon name="shield" size={24} className="mt-0.5 shrink-0" />
          Thông tin của bạn được bảo mật và chỉ chia sẻ với người thân, bác sĩ mà bạn cho phép.
        </div>
      </div>
    </div>
  )
}

/* ---------- Thanh điều hướng ---------- */

const NAV: { tab: Tab; label: string; icon: IconName }[] = [
  { tab: "home", label: "Trang chủ", icon: "home" },
  { tab: "health", label: "Sức khỏe", icon: "activity" },
  { tab: "meds", label: "Lịch thuốc", icon: "pill" },
  { tab: "alerts", label: "Cảnh báo", icon: "alert" },
  { tab: "profile", label: "Hồ sơ", icon: "user" },
]

function BottomNav({ tab, go }: { tab: Tab; go: (t: Tab) => void }) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="grid shrink-0 grid-cols-5 border-t border-line bg-white px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-6px_20px_rgba(21,94,75,.06)]"
    >
      {NAV.map((n) => {
        const active = tab === n.tab
        return (
          <button
            key={n.tab}
            onClick={() => go(n.tab)}
            aria-current={active ? "page" : undefined}
            className="flex min-h-[60px] flex-col items-center justify-center gap-1"
          >
            <span
              className={`grid h-8 w-14 place-items-center rounded-full transition ${
                active ? "bg-mint text-brand" : "text-[#6E7B74]"
              }`}
            >
              <Icon name={n.icon} size={24} stroke={active ? 2.2 : 1.8} />
            </span>
            <span
              className={`text-[13px] leading-none ${
                active ? "font-bold text-brand" : "font-medium text-[#6E7B74]"
              }`}
            >
              {n.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

/* ---------- Ứng dụng ---------- */

export default function App() {
  const [tab, setTab] = useState<Tab>("home")
  const [series, setSeries] = useState<Series>(INITIAL_SERIES)
  const [metric, setMetric] = useState<MetricKey>("bp")
  const [adding, setAdding] = useState(false)
  const [meds, setMeds] = useState<Med[]>(INITIAL_MEDS)
  const [toast, setToast] = useState("")
  const [profile, setProfile] = useState<Profile>({
    name: "Nguyễn Văn An",
    gender: "Nam",
    dob: "12/03/1951",
    phone: "0901 234 567",
    address: "25 Lê Lợi, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
    height: "165",
  })
  const scroller = useRef<HTMLElement>(null)
  const toastTimer = useRef(0)

  const height = parseFloat(profile.height) || 0

  const go = (t: Tab) => {
    setTab(t)
    scroller.current?.scrollTo({ top: 0 })
  }

  const showToast = (msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(""), 2600)
  }

  const saveMeasurement = (v: number, d?: number) => {
    setSeries((s) => {
      const next = { ...s, [metric]: [...s[metric].slice(0, 6), v] }
      if (metric === "bp" && d) next.dia = [...s.dia.slice(0, 6), d]
      return next
    })
    setAdding(false)
    showToast("Đã lưu số đo của bạn")
  }

  const confirmMed = (id: number) => {
    setMeds((list) =>
      list.map((m) => (m.id === id ? { ...m, status: "taken", takenAt: "10:15" } : m)),
    )
    showToast("Đã ghi nhận bạn uống thuốc")
  }

  return (
    <div className="min-h-dvh bg-[#DCE8E1] md:flex md:items-center md:justify-center md:p-6">
      <div className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-canvas md:h-[844px] md:max-h-[calc(100dvh-48px)] md:w-[390px] md:rounded-[44px] md:shadow-[0_30px_80px_rgba(21,94,75,.28)] md:ring-8 md:ring-[#10241D]">
        <main ref={scroller} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          {tab === "home" && (
            <HomeScreen
              series={series}
              height={height}
              meds={meds}
              go={go}
              openMetric={(k) => {
                setMetric(k)
                go("health")
              }}
            />
          )}
          {tab === "health" && (
            <HealthScreen
              series={series}
              height={height}
              metric={metric}
              setMetric={setMetric}
              onAdd={() => setAdding(true)}
            />
          )}
          {tab === "meds" && <MedsScreen meds={meds} confirm={confirmMed} />}
          {tab === "alerts" && <SosScreen />}
          {tab === "profile" && <ProfileScreen profile={profile} setProfile={setProfile} />}
        </main>

        <BottomNav tab={tab} go={go} />

        {adding && (
          <AddSheet metric={metric} onClose={() => setAdding(false)} onSave={saveMeasurement} />
        )}

        {toast && (
          <div
            role="status"
            className="screen-enter absolute inset-x-5 bottom-24 z-50 flex items-center gap-3 rounded-2xl bg-ink px-4 py-3.5 text-[16px] font-semibold text-white shadow-xl"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand">
              <Icon name="check" size={18} stroke={2.8} />
            </span>
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
