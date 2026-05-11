const STRINGS = {
    "app.title": "Vernon Tasks",
    "nav.tasks": "Tugas",
    "nav.dashboard": "Dashboard",
    "nav.analytics": "Analitik",
    "nav.me": "Saya",
    "login.title": "Masuk ke Vernon",
    "login.username": "Email atau Username",
    "login.password": "Kata Sandi",
    "login.submit": "Masuk",
    "login.error": "Email atau kata sandi salah.",
    "logout": "Keluar",
    "common.retry": "Coba lagi",
    "common.refresh": "Muat ulang",
    "common.loading": "Memuat…",
    "common.coming_soon": "Segera hadir",
    "offline.banner": "Mode offline · terakhir sinkron",
    "stale.prefix": "Diperbarui",
    "empty.no_offline": "Belum ada data offline.",
    "empty.no_tasks": "Tidak ada tugas hari ini. Nikmati waktumu.",
    "tasks.section.overdue": "Terlambat",
    "tasks.section.today": "Hari Ini",
    "tasks.section.upcoming": "Mendatang",
    "tasks.detail.action_disabled": "Tersedia di pembaruan berikutnya",
    "relogin.title": "Sesi berakhir",
    "relogin.body": "Sesi Anda berakhir. Silakan masuk lagi untuk melanjutkan.",
    "onboarding.welcome.title": "Selamat datang di Vernon",
    "onboarding.welcome.body": "Tugas, sprint, dan analitik tim Anda di satu tempat.",
    "onboarding.anywhere.title": "Tugas Anda, di mana saja",
    "onboarding.anywhere.body": "Bisa di-install seperti aplikasi, tetap bisa dilihat saat offline.",
    "onboarding.start.title": "Mari mulai",
    "onboarding.start.cta": "Mulai",
    "error.boundary.title": "Terjadi kesalahan",
    "error.boundary.body": "Halaman gagal dimuat. Coba muat ulang.",
};
export function t(key) {
    return STRINGS[key] ?? key;
}
const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
export function fmtDate(d) {
    const dt = typeof d === "string" ? new Date(d) : d;
    return dateFmt.format(dt);
}
export function fmtTime(d) {
    const dt = typeof d === "string" ? new Date(d) : d;
    return timeFmt.format(dt);
}
export function fmtRelative(ms) {
    if (ms < 60_000)
        return "baru saja";
    if (ms < 3_600_000)
        return `${Math.floor(ms / 60_000)} menit lalu`;
    if (ms < 86_400_000)
        return `${Math.floor(ms / 3_600_000)} jam lalu`;
    return `${Math.floor(ms / 86_400_000)} hari lalu`;
}
export function greeting(hour = new Date().getHours()) {
    if (hour < 11)
        return "Selamat pagi";
    if (hour < 15)
        return "Selamat siang";
    if (hour < 18)
        return "Selamat sore";
    return "Selamat malam";
}
