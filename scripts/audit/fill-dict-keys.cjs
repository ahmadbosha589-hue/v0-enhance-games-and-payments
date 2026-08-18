// Fill the 9 missing keys in every non-English dictionary.
// nav: blog, earn, offerwalls, ptc
// admin: adManagement, fraudReview, systemSettings, backToUserView
// footer: aml
const fs = require("node:fs")
const path = require("node:path")

const T = {
  es: { blog: "Blog", earn: "Ganar", offerwalls: "Muros de ofertas", ptc: "Anuncios PTC",
        adManagement: "Gestión de anuncios", fraudReview: "Revisión de fraude", systemSettings: "Configuración del sistema", backToUserView: "Volver a la vista de usuario",
        aml: "Política AML" },
  ru: { blog: "Блог", earn: "Заработок", offerwalls: "Офферволлы", ptc: "PTC-реклама",
        adManagement: "Управление рекламой", fraudReview: "Проверка мошенничества", systemSettings: "Системные настройки", backToUserView: "Вернуться к виду пользователя",
        aml: "Политика AML" },
  zh: { blog: "博客", earn: "赚取", offerwalls: "任务墙", ptc: "PTC广告",
        adManagement: "广告管理", fraudReview: "欺诈审查", systemSettings: "系统设置", backToUserView: "返回用户视图",
        aml: "反洗钱政策" },
  ja: { blog: "ブログ", earn: "稼ぐ", offerwalls: "オファーウォール", ptc: "PTC広告",
        adManagement: "広告管理", fraudReview: "不正レビュー", systemSettings: "システム設定", backToUserView: "ユーザービューに戻る",
        aml: "AMLポリシー" },
  ko: { blog: "블로그", earn: "수익", offerwalls: "오퍼월", ptc: "PTC 광고",
        adManagement: "광고 관리", fraudReview: "사기 검토", systemSettings: "시스템 설정", backToUserView: "사용자 보기로 돌아가기",
        aml: "AML 정책" },
  cs: { blog: "Blog", earn: "Vydělávat", offerwalls: "Offerwally", ptc: "PTC reklamy",
        adManagement: "Správa reklam", fraudReview: "Kontrola podvodů", systemSettings: "Nastavení systému", backToUserView: "Zpět na zobrazení uživatele",
        aml: "Zásady AML" },
  fr: { blog: "Blog", earn: "Gagner", offerwalls: "Murs d'offres", ptc: "Annonces PTC",
        adManagement: "Gestion des annonces", fraudReview: "Examen des fraudes", systemSettings: "Paramètres système", backToUserView: "Retour à la vue utilisateur",
        aml: "Politique AML" },
  de: { blog: "Blog", earn: "Verdienen", offerwalls: "Offerwalls", ptc: "PTC-Anzeigen",
        adManagement: "Anzeigenverwaltung", fraudReview: "Betrugsprüfung", systemSettings: "Systemeinstellungen", backToUserView: "Zurück zur Benutzeransicht",
        aml: "AML-Richtlinie" },
  pt: { blog: "Blog", earn: "Ganhar", offerwalls: "Murais de ofertas", ptc: "Anúncios PTC",
        adManagement: "Gestão de anúncios", fraudReview: "Revisão de fraude", systemSettings: "Configurações do sistema", backToUserView: "Voltar à visão do usuário",
        aml: "Política AML" },
  ar: { blog: "المدونة", earn: "اكسب", offerwalls: "جدران العروض", ptc: "إعلانات PTC",
        adManagement: "إدارة الإعلانات", fraudReview: "مراجعة الاحتيال", systemSettings: "إعدادات النظام", backToUserView: "الرجوع إلى عرض المستخدم",
        aml: "سياسة مكافحة غسل الأموال" },
  tr: { blog: "Blog", earn: "Kazan", offerwalls: "Teklif duvarları", ptc: "PTC Reklamları",
        adManagement: "Reklam Yönetimi", fraudReview: "Dolandırıcılık İncelemesi", systemSettings: "Sistem Ayarları", backToUserView: "Kullanıcı Görünümüne Dön",
        aml: "AML Politikası" },
  vi: { blog: "Blog", earn: "Kiếm tiền", offerwalls: "Tường ưu đãi", ptc: "Quảng cáo PTC",
        adManagement: "Quản lý quảng cáo", fraudReview: "Xem xét gian lận", systemSettings: "Cài đặt hệ thống", backToUserView: "Trở về chế độ người dùng",
        aml: "Chính sách AML" },
  th: { blog: "บล็อก", earn: "หารายได้", offerwalls: "ออฟเฟอร์วอลล์", ptc: "โฆษณา PTC",
        adManagement: "การจัดการโฆษณา", fraudReview: "ตรวจสอบการทุจริต", systemSettings: "การตั้งค่าระบบ", backToUserView: "กลับไปที่มุมมองผู้ใช้",
        aml: "นโยบาย AML" },
  id: { blog: "Blog", earn: "Hasilkan", offerwalls: "Offerwall", ptc: "Iklan PTC",
        adManagement: "Manajemen Iklan", fraudReview: "Tinjauan Penipuan", systemSettings: "Pengaturan Sistem", backToUserView: "Kembali ke Tampilan Pengguna",
        aml: "Kebijakan AML" },
  nl: { blog: "Blog", earn: "Verdienen", offerwalls: "Offerwalls", ptc: "PTC-advertenties",
        adManagement: "Advertentiebeheer", fraudReview: "Fraudebeoordeling", systemSettings: "Systeeminstellingen", backToUserView: "Terug naar gebruikersweergave",
        aml: "AML-beleid" },
  pl: { blog: "Blog", earn: "Zarabiaj", offerwalls: "Offerwalle", ptc: "Reklamy PTC",
        adManagement: "Zarządzanie reklamami", fraudReview: "Przegląd oszustw", systemSettings: "Ustawienia systemu", backToUserView: "Powrót do widoku użytkownika",
        aml: "Polityka AML" },
  uk: { blog: "Блог", earn: "Заробляти", offerwalls: "Офервол", ptc: "PTC-реклама",
        adManagement: "Керування рекламою", fraudReview: "Перевірка шахрайства", systemSettings: "Системні налаштування", backToUserView: "Повернутися до вигляду користувача",
        aml: "Політика AML" },
}

const NAV = ["blog", "earn", "offerwalls", "ptc"]
const ADMIN = ["adManagement", "fraudReview", "systemSettings", "backToUserView"]

const dir = "lib/i18n/dictionaries"
let totalAdded = 0
const report = []

for (const [lang, t] of Object.entries(T)) {
  const file = path.join(dir, `${lang}.ts`)
  if (!fs.existsSync(file)) { report.push(`${lang}: FILE MISSING`); continue }
  const lines = fs.readFileSync(file, "utf8").split("\n")
  let added = 0

  // Locate a top-level section `  <name>: {` and return [startIdx, endIdx] of its closing `  },`
  function section(name) {
    const start = lines.findIndex((l) => new RegExp(`^  ${name}:\\s*\\{`).test(l))
    if (start === -1) return null
    for (let i = start + 1; i < lines.length; i++) {
      if (/^  \},?\s*$/.test(lines[i])) return [start, i]
    }
    return null
  }

  function hasKey(range, key) {
    for (let i = range[0]; i <= range[1]; i++) {
      if (new RegExp(`^\\s*${key}:`).test(lines[i])) return true
    }
    return false
  }

  // Insert missing keys before the section's closing brace, deepest-last so indices hold.
  const plan = [
    { sec: "footer", keys: ["aml"] },
    { sec: "admin", keys: ADMIN },
    { sec: "nav", keys: NAV },
  ]

  for (const { sec, keys } of plan) {
    const range = section(sec)
    if (!range) { report.push(`${lang}: section '${sec}' not found`); continue }
    const missing = keys.filter((k) => !hasKey(range, k))
    if (missing.length === 0) continue
    const insertAt = range[1] // the closing `  },`
    const block = missing.map((k) => `    ${k}: ${JSON.stringify(t[k])},`)
    lines.splice(insertAt, 0, ...block)
    added += missing.length
  }

  if (added > 0) {
    fs.writeFileSync(file, lines.join("\n"))
    totalAdded += added
    report.push(`${lang}: +${added} keys`)
  } else {
    report.push(`${lang}: already complete`)
  }
}

console.log(report.join("\n"))
console.log(`\nTOTAL KEYS ADDED: ${totalAdded}`)
