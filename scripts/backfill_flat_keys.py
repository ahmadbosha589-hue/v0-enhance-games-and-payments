#!/usr/bin/env python3
"""Backfill missing flat-translation keys in translations.ts (es/ru/zh/ja/ko
blocks) with translated values. Idempotent: skips keys already present."""
from pathlib import Path
import re

SRC = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare/lib/i18n/translations.ts")

# Translated values for the missing keys, per locale.
FILL = {
    "es": {
        "admin.nav.boosters": "Potenciadores",
        "admin.nav.coupons": "Cupones",
        "admin.nav.shortlinks": "Enlaces cortos",
        "admin.nav.tournaments": "Torneos",
        "contact.form.other": "Otro",
        "contact.response.description": "Normalmente respondemos en 24 horas en días laborables.",
        "contact.response.title": "Tiempo de respuesta",
        "dashboard.nav.advertise": "Anúnciate",
        "dashboard.nav.swap": "Cambio de cripto",
        "dashboard.nav.tournaments": "Torneos",
        "hero.trust.trustedGeneric": "Plataforma confiable",
        "hero.trust.trustedWithCount": "Con la confianza de {count} usuarios",
        "testimonials.badge": "Testimonios",
        "testimonials.subtitle": "Mira lo que dice nuestra comunidad sobre ganar con nosotros.",
        "testimonials.title": "Con la confianza de",
        "testimonials.titleHighlight": "miles de usuarios",
        "userMenu.signingOut": "Cerrando sesión...",
    },
    "ru": {
        "admin.nav.boosters": "Усилители",
        "admin.nav.coupons": "Купоны",
        "admin.nav.shortlinks": "Короткие ссылки",
        "admin.nav.tournaments": "Турниры",
        "contact.form.other": "Другое",
        "contact.response.description": "Обычно отвечаем в течение 24 часов в рабочие дни.",
        "contact.response.title": "Время ответа",
        "dashboard.nav.advertise": "Реклама",
        "dashboard.nav.swap": "Обмен криптовалюты",
        "dashboard.nav.tournaments": "Турниры",
        "hero.trust.trustedGeneric": "Надёжная платформа",
        "hero.trust.trustedWithCount": "Нам доверяют {count} пользователей",
        "testimonials.badge": "Отзывы",
        "testimonials.subtitle": "Узнайте, что нашаCommunity говорит о заработке с нами.",
        "testimonials.title": "Нам доверяют",
        "testimonials.titleHighlight": "тысячи пользователей",
        "userMenu.signingOut": "Выход из аккаунта...",
    },
    "zh": {
        "admin.nav.boosters": "加速器",
        "admin.nav.coupons": "优惠券",
        "admin.nav.shortlinks": "短链接",
        "admin.nav.tournaments": "锦标赛",
        "contact.form.other": "其他",
        "contact.response.description": "工作日我们通常会在 24 小时内回复。",
        "contact.response.title": "回复时间",
        "dashboard.nav.advertise": "投放广告",
        "dashboard.nav.swap": "加密货币兑换",
        "dashboard.nav.tournaments": "锦标赛",
        "hero.trust.trustedGeneric": "值得信赖的平台",
        "hero.trust.trustedWithCount": "已有 {count} 位用户信赖",
        "testimonials.badge": "用户评价",
        "testimonials.subtitle": "看看我们的社区对与我们一同赚取收益的评价。",
        "testimonials.title": "深受信赖，",
        "testimonials.titleHighlight": "数以千计的赚取者",
        "userMenu.signingOut": "正在退出登录...",
    },
    "ja": {
        "admin.nav.boosters": "ブースター",
        "admin.nav.coupons": "クーポン",
        "admin.nav.shortlinks": "ショートリンク",
        "admin.nav.tournaments": "トーナメント",
        "contact.form.subject.other": "その他",
        "contact.form.other": "その他",
        "contact.response.description": "営業日の場合は通常24時間以内に返信いたします。",
        "contact.response.title": "回答時間",
        "dashboard.nav.advertise": "広告を出稿",
        "dashboard.nav.swap": "クリプト交換",
        "dashboard.nav.tournaments": "トーナメント",
        "hero.trust.trustedGeneric": "信頼されるプラットフォーム",
        "hero.trust.trustedWithCount": "{count}人のユーザーに信頼されています",
        "testimonials.badge": "お客様の声",
        "testimonials.subtitle": "私たちと一緒に稼ぐコミュニティの声をご覧ください。",
        "testimonials.title": "信頼される",
        "testimonials.titleHighlight": "数千人の稼ぐユーザー",
        "userMenu.signingOut": "ログアウト中...",
    },
    "ko": {
        "admin.nav.boosters": "부스터",
        "admin.nav.coupons": "쿠폰",
        "admin.nav.shortlinks": "숏링크",
        "admin.nav.tournaments": "토너먼트",
        "contact.form.other": "기타",
        "contact.response.description": "영업일 기준 24시간 이내에 답변드립니다.",
        "contact.response.title": "응답 시간",
        "dashboard.nav.advertise": "광고 문의",
        "dashboard.nav.swap": "크립토 스왑",
        "dashboard.nav.tournaments": "토너먼트",
        "hero.trust.trustedGeneric": "신뢰할 수 있는 플랫폼",
        "hero.trust.trustedWithCount": "{count}명의 사용자가 신뢰합니다",
        "nav.dashboard": "대시보드",
        "nav.logout": "로그아웃",
        "nav.menu": "메뉴",
        "nav.settings": "설정",
        "testimonials.badge": "사용자 후기",
        "testimonials.subtitle": "저희와 함께 수익을 창출하는 커뮤니티의 이야기를 확인하세요.",
        "testimonials.title": "신뢰받는",
        "testimonials.titleHighlight": "수천 명의 사용자",
        "userMenu.signingOut": "로그아웃 중...",
    },
}

src = SRC.read_text(encoding="utf-8")
total_added = 0
for loc, fills in FILL.items():
    # Locate the locale block: `const <loc>: Record<TranslationKey, string> = {`
    block_re = re.compile(
        r"(const %s: Record<TranslationKey, string> = \{)" % loc, re.M
    )
    m = block_re.search(src)
    if not m:
        print(f"{loc}: BLOCK NOT FOUND")
        continue
    block_start = m.end()
    # Find the closing `}` at column 0 after block_start
    close = src.find("\n}", block_start)
    block = src[block_start:close]
    already = set(re.findall(r"\n\s+\"([a-zA-Z.]+)\":", block))
    additions = []
    for key, val in fills.items():
        if key in already:
            continue
        additions.append(f'  "{key}": "{val}",')
        total_added += 1
    if additions:
        insert = "\n".join(additions) + "\n"
        src = src[:close] + insert + src[close:]
        print(f"{loc}: +{len(additions)} keys")
    else:
        print(f"{loc}: nothing to add")

SRC.write_text(src, encoding="utf-8")
print(f"TOTAL ADDED: {total_added}")
