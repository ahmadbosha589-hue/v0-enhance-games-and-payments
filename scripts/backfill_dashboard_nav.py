#!/usr/bin/env python3
"""Inject a translated `nav` section into each locale's namespaces/dashboard.ts.

The sidebar (components/dashboard/sidebar.tsx) resolves dashboard.nav.* keys on
every dashboard route. Before this change only the flat map carried those keys
and 14 of 20 locales rendered the English sidebar. This adds a `nav` section
with the 22 sidebar labels, translated per locale, right after
`export default {` in each namespace file (idempotent: skips files that
already have a nav section).
"""
from pathlib import Path
import re

ROOT = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare/lib/i18n/namespaces")

# 22 sidebar labels per locale. Order mirrors the sidebar's nav section.
NAV = {
    "en": ["Overview","Claim","Boosters","Withdrawals","Crypto Swap","Advertise","Referrals","History","Leaderboard","Notifications","All Earn Options","Direct Faucet","Games","Tournaments","Coupons","Shortlinks","Offerwalls","PTC Ads","Achievements","Support Us","Settings","Help Center"],
    "ar": ["نظرة عامة","استلام","المعززات","عمليات السحب","تبديل العملات","أعلن معنا","الإحالات","السجل","لوحة الصدارة","الإشعارات","جميع خيارات الكسب","الحنفية المباشرة","الألعاب","البطولات","أكواد القسائم","الروابط المختصرة","جدران العروض","إعلانات PTC","الإنجازات","ادعمونا","الإعدادات","مركز المساعدة"],
    "cs": ["Přehled","Vybrat","Posílovače","Výběry","Směna kryptoměn","Inzerovat","Doporučení","Historie","Žebříček","Oznámení","Všechny možnosti výdělku","Přímý faucet","Hry","Turnaje","Kupóny","Zkrácené odkazy","Offerwalls","PTC reklamy","Úspěchy","Podpořte nás","Nastavení","Centrum nápovědy"],
    "de": ["Übersicht","Abholen","Booster","Auszahlungen","Krypto-Tausch","Werben","Empfehlungen","Verlauf","Rangliste","Benachrichtigungen","Alle Verdiensoptionen","Direkter Faucet","Spiele","Turniere","Gutscheine","Shortlinks","Offerwalls","PTC-Anzeigen","Erfolge","Unterstütze uns","Einstellungen","Hilfe-Center"],
    "es": ["Resumen","Reclamar","Potenciadores","Retiros","Cambio de cripto","Anúnciate","Referidos","Historial","Clasificación","Notificaciones","Todas las opciones de ganancia","Faucet directo","Juegos","Torneos","Cupones","Enlaces cortos","Muros de ofertas","Anuncios PTC","Logros","Apóyanos","Ajustes","Centro de ayuda"],
    "fr": ["Aperçu","Réclamer","Boosters","Retraits","Échange crypto","Annoncer","Parrainages","Historique","Classement","Notifications","Toutes les options de gain","Faucet direct","Jeux","Tournois","Coupons","Liens courts","Murs d'offres","Annonces PTC","Succès","Soutenez-nous","Paramètres","Centre d'aide"],
    "hi": ["अवलोकन","दावा करें","बूस्टर","निकासी","क्रिप्टो स्वैप","विज्ञापन दें","रेफ़रल","इतिहास","लीडरबोर्ड","सूचनाएँ","सभी कमाई विकल्प","डायरेक्ट फ़ॉसेट","गेम्स","टूर्नामेंट","कूपन","शॉर्टलिंक","ऑफ़रवॉल","PTC विज्ञापन","उपलब्धियाँ","हमें सहारा दें","सेटिंग्स","सहायता केंद्र"],
    "id": ["Ikhtisar","Klaim","Booster","Penarikan","Tukar Kripto","Beriklan","Referensi","Riwayat","Papan Peringkat","Notifikasi","Semua Opcion Penghasilan","Faucet Langsung","Game","Turnamen","Kupon","Tautan Pendek","Offerwall","Iklan PTC","Pencapaian","Dukung Kami","Pengaturan","Pusat Bantuan"],
    "it": ["Panoramica","Riscatta","Potenziamenti","Prelievi","Scambio Crypto","Fai pubblicità","Referral","Cronologia","Classifica","Notifiche","Tutte le opzioni di guadagno","Faucet diretto","Giochi","Tornei","Coupon","Link brevi","Muri di offerte","Annunci PTC","Obiettivi","Sostienici","Impostazioni","Centro assistenza"],
    "ja": ["概要","クレーム","ブースター","出金","クリプト交換","広告を出稿","紹介","履歴","ランキング","通知","すべての稼ぎ方","ダイレクトフォーセット","ゲーム","トーナメント","クーポン","ショートリンク","オファーウォール","PTC広告","実績","サポート","設定","ヘルプセンター"],
    "ko": ["개요","받기","부스터","출금","크립토 스왑","광고 문의","추천","기록","리더보드","알림","모든 적립 옵션","다이렉트 포싯","게임","토너먼트","쿠폰","숏링크","오퍼월","PTC 광고","업적","후원하기","설정","도움말 센터"],
    "nl": ["Overzicht","Claimen","Boosters","Opnames","Crypto Swap","Adverteren","Verwijzingen","Geschiedenis","Ranglijst","Meldingen","Alle verdienopties","Directe Faucet","Spellen","Toernooien","Coupons","Shortlinks","Offerwalls","PTC-advertenties","Prestaties","Steun ons","Instellingen","Helpcentrum"],
    "pl": ["Przegląd","Odbierz","Wzmacniacze","Wypłaty","Wymiana krypto","Reklamuj się","Polecenia","Historia","Ranking","Powiadomienia","Wszystkie opcje zarobku","Bezpośredni kran","Gry","Turnieje","Kupony","Krótkie linki","Ściany ofert","Reklamy PTC","Osiągnięcia","Wesprzyj nas","Ustawienia","Centrum pomocy"],
    "pt": ["Visão Geral","Resgatar","Impulsionadores","Saques","Troca de Cripto","Anuncie","Indicações","Histórico","Classificação","Notificações","Todas as opções de ganho","Faucet direto","Jogos","Torneios","Cupons","Links curtos","Muros de ofertas","Anúncios PTC","Conquistas","Apoie-nos","Configurações","Central de Ajuda"],
    "ru": ["Обзор","Получить","Усилители","Выводы","Обмен криптовалюты","Реклама","Рефералы","История","Рейтинг","Уведомления","Все способы заработка","Прямой кран","Игры","Турниры","Купоны","Короткие ссылки","Офферволлы","PTC-реклама","Достижения","Поддержите нас","Настройки","Центр помощи"],
    "th": ["ภาพรวม","รับรางวัล","บูสเตอร์","การถอน","แลกเปลี่ยนคริปโต","ลงโฆษณา","การแนะนำ","ประวัติ","กระดานผู้นำ","การแจ้งเตือน","ตัวเลือกการหาเงินทั้งหมด","ฟอสเอตโดยตรง","เกม","ทัวร์นาเมนต์","คูปอง","ลิงก์สั้น","ออฟเฟอร์วอลล์","โฆษณา PTC","ความสำเร็จ","สนับสนุนเรา","การตั้งค่า","ศูนย์ช่วยเหลือ"],
    "tr": ["Genel Bakış","Talep Et","Güçlendiriciler","Para Çekme","Kripto Takas","Reklam Ver","Davetiyeler","Geçmiş","Liderlik Tablosu","Bildirimler","Tüm Kazanma Seçenekleri","Doğrudan Faucet","Oyunlar","Turnuvalar","Kuponlar","Kısa Linkler","Teklif Duvarları","PTC Reklamları","Başarımlar","Bizi Destekleyin","Ayarlar","Yardım Merkezi"],
    "uk": ["Огляд","Отримати","Підсилювачі","Виведення","Обмін криптовалют","Реклама","Реферали","Історія","Рейтинг","Сповіщення","Усі способи заробітку","Прямий кран","Ігри","Турніри","Купони","Короткі посилання","Офферволи","PTC-реклама","Досягнення","Підтримайте нас","Налаштування","Центр допомоги"],
    "vi": ["Tổng Quan","Nhận","Bộ Tăng Cường","Rút Tiền","Hoán đổi Crypto","Quảng cáo","Giới thiệu","Lịch sử","Bảng Xếp Hạng","Thông báo","Tất cả tùy chọn kiếm tiền","Faucet Trực tiếp","Trò chơi","Giải Đấu","Mã Giảm Giá","Liên kết rút gọn","Tường Ưu đãi","Quảng cáo PTC","Thành Tựu","Ủng hộ chúng tôi","Cài đặt","Trung tâm Trợ giúp"],
    "zh": ["概览","领取","加速器","提现","加密货币兑换","投放广告","推荐","历史记录","排行榜","通知","所有赚取选项","直接水龙头","游戏","锦标赛","优惠券","短链接","任务墙","PTC 广告","成就","支持我们","设置","帮助中心"],
}

KEYS = ["overview","claim","boosters","withdrawals","swap","advertise","referrals","history","leaderboard","notifications","allEarnOptions","directFaucet","games","tournaments","coupons","shortlinks","offerwalls","ptcAds","achievements","supportUs","settings","helpCenter"]

def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')

changed, skipped = [], []
for loc, labels in NAV.items():
    path = ROOT / loc / "dashboard.ts"
    if not path.exists():
        skipped.append(f"{loc}: MISSING FILE")
        continue
    src = path.read_text(encoding="utf-8")
    if re.search(r"^\s{2}nav:\s*\{", src, re.M):
        skipped.append(f"{loc}: nav section already present")
        continue
    lines = ["  nav: {"]
    for key, label in zip(KEYS, labels):
        lines.append(f'    {key}: "{esc(label)}",')
    lines.append("  },")
    block = "\n".join(lines) + "\r\n"
    # Insert right after the object opener. Locales use either
    # `export default {` (en/ar/ja/ru/zh) or `export const dashboard = {`
    # (the other 15); the loader's extractTranslations handles both shapes.
    opener = re.compile(r"(export (?:default|const dashboard) ?=? \{\r?\n)")
    m = opener.search(src)
    if not m:
        skipped.append(f"{loc}: could not find object opener")
        continue
    new_src = src[: m.end()] + block + src[m.end():]
    path.write_text(new_src, encoding="utf-8")
    changed.append(loc)

print("CHANGED:", ", ".join(changed))
print("SKIPPED:", "; ".join(skipped) if skipped else "none")
