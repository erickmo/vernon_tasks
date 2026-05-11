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
  "actions.complete": "Selesai",
  "actions.log": "Log",
  "actions.snooze": "Tunda",
  "actions.snooze_1d": "+1 hari",
  "actions.snooze_3d": "+3 hari",
  "actions.snooze_7d": "+7 hari",
  "actions.completed_toast": "Selesai. Batalkan?",
  "actions.snoozed_toast": "Ditunda. Batalkan?",
  "actions.logged_toast": "Log tersimpan.",
  "actions.offline": "Sambungkan internet dulu",
  "actions.forbidden": "Tidak ada akses",
  "actions.failed": "Gagal. Coba lagi",
  "actions.undo": "Batalkan",
  "log.title": "Catat progres",
  "log.hours": "Jam",
  "log.note": "Catatan (opsional)",
  "log.submit": "Simpan",
  "log.cancel": "Batal",
  "install.title": "Pasang Vernon",
  "install.body": "Akses lebih cepat lewat ikon di layar utama.",
  "install.cta": "Pasang",
  "install.later": "Nanti",
  "install.ios.title": "Tambah ke Layar Utama",
  "install.ios.step1": "Tekan tombol Bagikan di Safari",
  "install.ios.step2": "Pilih ‘Tambahkan ke Layar Utama’",
  "install.ios.step3": "Tekan ‘Tambah’ di pojok kanan atas",
  "install.ios.close": "Mengerti",
  "search.placeholder": "Cari tugas…",
  "search.clear": "Hapus",
  "search.no_results": "Tidak ada tugas yang cocok.",
  "search.offline_no_cache": "Sambungkan internet untuk mencari",
  "search.failed": "Pencarian gagal",
  "filter.title": "Filter",
  "filter.priority": "Prioritas",
  "filter.project": "Proyek",
  "filter.due_range": "Tenggat",
  "filter.due.today": "Hari ini",
  "filter.due.week": "Minggu ini",
  "filter.due.overdue": "Terlambat",
  "filter.due.all": "Semua",
  "filter.apply": "Terapkan",
  "filter.reset": "Reset",
  "filter.button": "Filter",
  "filter.all_projects": "Semua proyek",
  "notif.title": "Notifikasi",
  "notif.mark_all": "Tandai semua",
  "notif.empty": "Belum ada notifikasi",
  "notif.link": "Notifikasi",
  "notif.failed": "Gagal memuat notifikasi",
  "notif.task_missing": "Tugas tidak ditemukan",
  "nav.leader": "Leader",
  "leader.title": "Review Leader",
  "leader.empty": "Tidak ada review tertunda",
  "leader.no_access": "Akses leader diperlukan",
  "leader.approve": "Setujui",
  "leader.reject": "Tolak",
  "leader.confirm_approve": "Setujui tugas?",
  "leader.approved_toast": "Disetujui.",
  "leader.rejected_toast": "Ditolak.",
  "leader.approve_failed": "Gagal setujui",
  "leader.reject_failed": "Gagal tolak",
  "reject.title": "Alasan penolakan",
  "reject.body": "Berikan alasan yang jelas agar bisa diperbaiki.",
  "reject.placeholder": "Tulis alasan…",
  "reject.submit": "Tolak",
  "reject.cancel": "Batal",
  "reject.too_short": "Minimal 5 karakter",
  "push.title": "Notifikasi push",
  "push.status_on": "Aktif. Anda akan menerima notifikasi.",
  "push.status_off": "Nonaktif. Aktifkan untuk dapat notifikasi instan.",
  "push.status_denied": "Diblokir browser. Aktifkan dari pengaturan situs.",
  "push.turn_on": "Aktifkan",
  "push.turn_off": "Matikan",
  "push.unsupported": "Browser tidak mendukung push.",
  "push.failed": "Gagal mengubah status push.",
  "push.ios_hint": "iOS: install dulu ke layar utama agar push bekerja.",
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey): string {
  return (STRINGS as Record<string, string>)[key] ?? key;
}

const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });

export function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dateFmt.format(dt);
}

export function fmtTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return timeFmt.format(dt);
}

export function fmtRelative(ms: number): string {
  if (ms < 60_000) return "baru saja";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} menit lalu`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} jam lalu`;
  return `${Math.floor(ms / 86_400_000)} hari lalu`;
}

export function greeting(hour: number = new Date().getHours()): string {
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 18) return "Selamat sore";
  return "Selamat malam";
}
