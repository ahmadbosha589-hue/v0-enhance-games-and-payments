#!/usr/bin/env python3
"""Backfill the 13 new adblock-namespace keys (warning-modal strings) into the
other 19 locale namespace files. Idempotent: only adds keys a file lacks."""
import re
from pathlib import Path

NS = Path(r"C:/Users/pc/AppData/Local/hermes/cache/scratch/gh-compare/lib/i18n/namespaces")

# The 13 new keys from lib/i18n/namespaces/en/adblock.ts, translated.
FILLS = {
    "ar": {
        "accountFlagged": "الحساب موضع علامة",
        "flaggedBody": "تم وضع علامة على حسابك للاستخدام المستمر لحاجب الإعلانات. الأرباح والسحوبات والمكافآت متوقفة طالما هذه العلامة نشطة.",
        "flaggedAppeal": "إذا كان هذا خطأً — على سبيل المثال متصفح صارم أو VPN أو فلتر DNS — فاضغط \"الاعتراض على هذا القرار\" أدناه وسيقوم فريقنا بمراجعة حالتك.",
        "detected": "تم اكتشاف",
        "serverVerified": "مؤكد من الخادم",
        "clientDetection": "اكتشاف من العميل",
        "appealTitle": "الاعتراض على هذا القرار",
        "appealProcessing": "جارٍ معالجة الاعتراض...",
        "appealAccepted": "تم قبول الاعتراض! جارٍ التحديث...",
        "appealRejected": "تم رفض الاعتراض. يرجى التواصل مع الدعم.",
        "refreshAfterChanges": "حدّث الصفحة بعد إجراء التغييرات",
        "refreshAfterDisabling": "حدّث الصفحة بعد التعطيل",
        "disableAllBlockers": "تحقق من وجود عدة حاجبات إعلانات - عطّلها جميعًا",
        "routerAdblock": "تحقق من إعدادات الموجّه بحثًا عن ميزات حجب الإعلانات",
        "dnsWhitelist": "إذا كنت تستخدم Pi-hole أو AdGuard Home أو NextDNS، فضِف هذا النطاق إلى القائمة البيضاء",
    },
    "cs": {
        "accountFlagged": "Účet označen",
        "flaggedBody": "Váš účet byl označen za trvalé používání blokování reklam. Výdělky, výběry a bonusy jsou pozastaveny, dokud je tato značka aktivní.",
        "flaggedAppeal": "Pokud jde o omyl — například přísný prohlížeč, VPN nebo DNS filtr — klepněte na „Odvolat se proti rozhodnutí\" níže a náš tým váš případ přezkoumá.",
        "detected": "Zjištěno",
        "serverVerified": "Ověřeno serverem",
        "clientDetection": "Detekce na klientovi",
        "appealTitle": "Odvolat se proti rozhodnutí",
        "appealProcessing": "Zpracovávání odvolání...",
        "appealAccepted": "Odvolání přijato! Obnovování...",
        "appealRejected": "Odvolání zamítnuto. Kontaktujte prosím podporu.",
        "refreshAfterChanges": "Po provedení změn stránku obnovte",
        "refreshAfterDisabling": "Po vypnění blokování stránku obnovte",
        "disableAllBlockers": "Zkontrolujte více blokátorů reklam - vypněte je všechny",
        "routerAdblock": "Zkontrolujte nastavení routeru pro funkce blokování reklam",
        "dnsWhitelist": "Pokud používáte Pi-hole, AdGuard Home nebo NextDNS, přidejte tuto doménu na bílou listinu",
    },
    "de": {
        "accountFlagged": "Konto markiert",
        "flaggedBody": "Ihr Konto wurde wegen dauerhafter Nutzung eines Ad-Blockers markiert. Verdienste, Auszahlungen und Boni sind pausiert, solange diese Markierung aktiv ist.",
        "flaggedAppeal": "Falls dies ein Fehler ist — z. B. ein strenger Browser, VPN oder DNS-Filter — tippen Sie unten auf „Gegen diese Entscheidung Einspruch erheben\" und unser Team prüft Ihren Fall.",
        "detected": "Erkannt",
        "serverVerified": "Serverbestätigt",
        "clientDetection": "Client-Erkennung",
        "appealTitle": "Gegen diese Entscheidung Einspruch erheben",
        "appealProcessing": "Einspruch wird verarbeitet...",
        "appealAccepted": "Einspruch akzeptiert! Wird neu geladen...",
        "appealRejected": "Einspruch abgelehnt. Bitte kontaktieren Sie den Support.",
        "refreshAfterChanges": "Laden Sie die Seite nach den Änderungen neu",
        "refreshAfterDisabling": "Laden Sie die Seite nach dem Deaktivieren neu",
        "disableAllBlockers": "Prüfen Sie, ob mehrere Ad-Blocker aktiv sind - deaktivieren Sie alle",
        "routerAdblock": "Prüfen Sie die Router-Einstellungen auf Werbeblocker-Funktionen",
        "dnsWhitelist": "Wenn Sie Pi-hole, AdGuard Home oder NextDNS verwenden, setzen Sie diese Domain auf die Whitelist",
    },
    "es": {
        "accountFlagged": "Cuenta marcada",
        "flaggedBody": "Tu cuenta ha sido marcada por el uso persistente de un bloqueador de anuncios. Las ganancias, retiros y bonos están pausados mientras esta marca esté activa.",
        "flaggedAppeal": "Si se trata de un error — por ejemplo un navegador estricto, VPN o filtro DNS — toca «Apelar esta decisión» abajo y nuestro equipo revisará tu caso.",
        "detected": "Detectado",
        "serverVerified": "Verificado por el servidor",
        "clientDetection": "Detección del cliente",
        "appealTitle": "Apelar esta decisión",
        "appealProcessing": "Procesando apelación...",
        "appealAccepted": "¡Apelación aceptada! Actualizando...",
        "appealRejected": "Apelación rechazada. Contacta con soporte.",
        "refreshAfterChanges": "Actualiza la página después de hacer cambios",
        "refreshAfterDisabling": "Actualiza la página después de desactivarlo",
        "disableAllBlockers": "Comprueba si hay varios bloqueadores de anuncios: desactívalos todos",
        "routerAdblock": "Revisa la configuración de tu router para funciones de bloqueo de anuncios",
        "dnsWhitelist": "Si usas Pi-hole, AdGuard Home o NextDNS, añade este dominio a la lista blanca",
    },
    "fr": {
        "accountFlagged": "Compte signalé",
        "flaggedBody": "Votre compte a été signalé pour utilisation persistante d'un bloqueur de publicités. Les gains, retraits et bonus sont suspendus tant que ce signalement est actif.",
        "flaggedAppeal": "S'il s'agit d'une erreur — par exemple un navigateur strict, un VPN ou un filtre DNS — appuyez sur « Faire appel de cette décision » ci-dessous et notre équipe examinera votre cas.",
        "detected": "Détecté",
        "serverVerified": "Vérifié par le serveur",
        "clientDetection": "Détection client",
        "appealTitle": "Faire appel de cette décision",
        "appealProcessing": "Traitement de l'appel...",
        "appealAccepted": "Appel accepté ! Actualisation...",
        "appealRejected": "Appel rejeté. Veuillez contacter l'assistance.",
        "refreshAfterChanges": "Actualisez la page après vos modifications",
        "refreshAfterDisabling": "Actualisez la page après la désactivation",
        "disableAllBlockers": "Vérifiez s'il y a plusieurs bloqueurs de publicités - désactivez-les tous",
        "routerAdblock": "Vérifiez les paramètres de votre routeur pour les fonctions de blocage de publicités",
        "dnsWhitelist": "Si vous utilisez Pi-hole, AdGuard Home ou NextDNS, ajoutez ce domaine à la liste blanche",
    },
    "hi": {
        "accountFlagged": "खाता चिह्नित",
        "flaggedBody": "एड-ब्लॉकर के लगातार उपयोग के कारण आपका खाता चिह्नित किया गया है। जब तक यह चिह्न सक्रिय है, कमाई, निकासी और बोनस रोके गए हैं।",
        "flaggedAppeal": "अगर यह गलती है — जैसे कोई सख्त ब्राउज़र, VPN या DNS फ़िल्टर — तो नीचे \"इस निर्णय के विरुद्ध अपील करें\" पर टैप करें और हमारी टीम आपका मामला देखेगी।",
        "detected": "पता चला",
        "serverVerified": "सर्वर द्वारा सत्यापित",
        "clientDetection": "क्लाइंट पहचान",
        "appealTitle": "इस निर्णय के विरुद्ध अपील करें",
        "appealProcessing": "अपील प्रसंस्करण...",
        "appealAccepted": "अपील स्वीकृत! पुनः लोड हो रहा है...",
        "appealRejected": "अपील अस्वीकृत। कृपया सहायता से संपर्क करें।",
        "refreshAfterChanges": "बदलाव करने के बाद पेज रीफ्रेश करें",
        "refreshAfterDisabling": "बंद करने के बाद पेज रीफ्रेश करें",
        "disableAllBlockers": "कई एड-ब्लॉकर हैं तो जाँचें - सभी को बंद करें",
        "routerAdblock": "राउटर सेटिंग्स में विज्ञापन-अवरोध सुविधाएँ जाँचें",
        "dnsWhitelist": "Pi-hole, AdGuard Home या NextDNS उपयोग करते हैं तो इस डोमेन को श्वेतसूची में डालें",
    },
    "id": {
        "accountFlagged": "Akun ditandai",
        "flaggedBody": "Akun Anda ditandai karena penggunaan pemblokir iklan terus-menerus. Penghasilan, penarikan, dan bonus dijeda selama tanda ini aktif.",
        "flaggedAppeal": "Jika ini kesalahan — misalnya browser ketat, VPN, atau filter DNS — ketuk \"Ajukan Banding\" di bawah dan tim kami akan meninjau kasus Anda.",
        "detected": "Terdeteksi",
        "serverVerified": "Terverifikasi server",
        "clientDetection": "Deteksi klien",
        "appealTitle": "Ajukan Banding",
        "appealProcessing": "Memproses banding...",
        "appealAccepted": "Banding diterima! Memuat ulang...",
        "appealRejected": "Banding ditolak. Silakan hubungi dukungan.",
        "refreshAfterChanges": "Muat ulang halaman setelah membuat perubahan",
        "refreshAfterDisabling": "Muat ulang halaman setelah menonaktifkan",
        "disableAllBlockers": "Periksa beberapa pemblokir iklan - nonaktifkan semuanya",
        "routerAdblock": "Periksa pengaturan router untuk fitur pemblokiran iklan",
        "dnsWhitelist": "Jika menggunakan Pi-hole, AdGuard Home, atau NextDNS, tambahkan domain ini ke daftar putih",
    },
    "it": {
        "accountFlagged": "Account segnalato",
        "flaggedBody": "Il tuo account è stato segnalato per l'uso persistente di un ad-blocker. Guadagni, prelievi e bonus sono sospesi finché questo flag è attivo.",
        "flaggedAppeal": "Se si tratta di un errore — ad esempio un browser restrittivo, una VPN o un filtro DNS — tocca \"Presenta ricorso\" qui sotto e il nostro team esaminerà il tuo caso.",
        "detected": "Rilevato",
        "serverVerified": "Verificato dal server",
        "clientDetection": "Rilevamento client",
        "appealTitle": "Presenta ricorso",
        "appealProcessing": "Elaborazione del ricorso...",
        "appealAccepted": "Ricorso accettato! Aggiornamento...",
        "appealRejected": "Ricorso respinto. Contatta l'assistenza.",
        "refreshAfterChanges": "Ricarica la pagina dopo le modifiche",
        "refreshAfterDisabling": "Ricarica la pagina dopo la disattivazione",
        "disableAllBlockers": "Controlla se ci sono più ad-blocker - disattivali tutti",
        "routerAdblock": "Controlla le impostazioni del router per le funzioni di blocco pubblicità",
        "dnsWhitelist": "Se usi Pi-hole, AdGuard Home o NextDNS, aggiungi questo dominio alla whitelist",
    },
    "ja": {
        "accountFlagged": "アカウントがフラグされました",
        "flaggedBody": "アドブロッカーの継続的な使用により、アカウントにフラグが付けられました。このフラグが有効な間、収益・出金・ボーナスは一時停止されています。",
        "flaggedAppeal": "もし間違いであれば — 例えば厳格なブラウザ設定、VPN、DNSフィルターなど — 下の「この決定に異議を申し立てる」をタップすると、当チームが確認します。",
        "detected": "検出",
        "serverVerified": "サーバー確認済み",
        "clientDetection": "クライアント検出",
        "appealTitle": "この決定に異議を申し立てる",
        "appealProcessing": "異議申し立てを処理中...",
        "appealAccepted": "異議申し立てが承認されました！更新中...",
        "appealRejected": "異議申し立てが拒否されました。サポートにお問い合わせください。",
        "refreshAfterChanges": "変更後、ページを更新してください",
        "refreshAfterDisabling": "無効化後、ページを更新してください",
        "disableAllBlockers": "複数のアドブロッカーがないか確認し、すべて無効にしてください",
        "routerAdblock": "ルーター設定に広告ブロック機能がないか確認してください",
        "dnsWhitelist": "Pi-hole、AdGuard Home、NextDNS を使用している場合は、このドメインをホワイトリストに追加してください",
    },
    "ko": {
        "accountFlagged": "계정 플래그됨",
        "flaggedBody": "광고 차단기를 지속적으로 사용하여 계정에 플래그가 지정되었습니다. 이 플래그가 활성화된 동안 수익, 출금, 보너스가 일시 중지됩니다.",
        "flaggedAppeal": "실수라면 — 예를 들어 엄격한 브라우저, VPN, DNS 필터 — 아래 \"이 결정에 이의 제기\"를 눌러 주시면 저희 팀이 사례를 검토합니다.",
        "detected": "감지됨",
        "serverVerified": "서버 확인됨",
        "clientDetection": "클라이언트 감지",
        "appealTitle": "이 결정에 이의 제기",
        "appealProcessing": "이의 제기 처리 중...",
        "appealAccepted": "이의 제기 승인됨! 새로고침 중...",
        "appealRejected": "이의 제기 거부됨. 지원팀에 문의해 주세요.",
        "refreshAfterChanges": "변경 후 페이지를 새로고침하세요",
        "refreshAfterDisabling": "비활성화 후 페이지를 새로고침하세요",
        "disableAllBlockers": "여러 광고 차단기가 있는지 확인하고 모두 비활성화하세요",
        "routerAdblock": "라우터 설정에서 광고 차단 기능을 확인하세요",
        "dnsWhitelist": "Pi-hole, AdGuard Home, NextDNS를 사용하는 경우 이 도메인을 화이트리스트에 추가하세요",
    },
    "nl": {
        "accountFlagged": "Account gemarkeerd",
        "flaggedBody": "Je account is gemarkeerd voor aanhoudend gebruik van een adblocker. Verdiensten, opnames en bonussen zijn gepauzeerd zolang deze markering actief is.",
        "flaggedAppeal": "Als dit een vergissing is — bijvoorbeeld een strenge browser, VPN of DNS-filter — tik dan onder op \"Bezwaar maken tegen deze beslissing\" en ons team beoordeelt je geval.",
        "detected": "Gedetecteerd",
        "serverVerified": "Server geverifieerd",
        "clientDetection": "Clientdetectie",
        "appealTitle": "Bezwaar maken tegen deze beslissing",
        "appealProcessing": "Bezwaar wordt verwerkt...",
        "appealAccepted": "Bezwaar geaccepteerd! Vernieuwen...",
        "appealRejected": "Bezwaar afgewezen. Neem contact op met support.",
        "refreshAfterChanges": "Ververs de pagina na het aanbrengen van wijzigingen",
        "refreshAfterDisabling": "Ververs de pagina na het uitschakelen",
        "disableAllBlockers": "Controleer op meerdere adblockers - schakel ze allemaal uit",
        "routerAdblock": "Controleer je routerinstellingen op adblockfuncties",
        "dnsWhitelist": "Bij gebruik van Pi-hole, AdGuard Home of NextDNS: voeg dit domein toe aan de whitelist",
    },
    "pl": {
        "accountFlagged": "Konto oflagowane",
        "flaggedBody": "Twoje konto zostało oflagowane za uporczywe korzystanie z blokera reklam. Zarobki, wypłaty i bonusy są wstrzymane, dopóki ta flaga jest aktywna.",
        "flaggedAppeal": "Jeśli to pomyłka — na przykładnie restrykcyjna przeglądarka, VPN lub filtr DNS — dotknij „Odwołaj się od tej decyzji” poniżej, a nasz zespół przejrzy Twoją sprawę.",
        "detected": "Wykryto",
        "serverVerified": "Zweryfikowane przez serwer",
        "clientDetection": "Detekcja po stronie klienta",
        "appealTitle": "Odwołaj się od tej decyzji",
        "appealProcessing": "Przetwarzanie odwołania...",
        "appealAccepted": "Odwołanie przyjęte! Odświeżanie...",
        "appealRejected": "Odwołanie odrzucone. Skontaktuj się z pomocą.",
        "refreshAfterChanges": "Odśwież stronę po wprowadzeniu zmian",
        "refreshAfterDisabling": "Odśwież stronę po wyłączeniu",
        "disableAllBlockers": "Sprawdź, czy nie masz kilku blokerów reklam - wyłącz wszystkie",
        "routerAdblock": "Sprawdź ustawienia routera pod kątem funkcji blokowania reklam",
        "dnsWhitelist": "Jeśli używasz Pi-hole, AdGuard Home lub NextDNS, dodaj tę domenę do białej listy",
    },
    "pt": {
        "accountFlagged": "Conta sinalizada",
        "flaggedBody": "Sua conta foi sinalizada pelo uso persistente de bloqueador de anúncios. Ganhos, saques e bônus estão pausados enquanto essa sinalização estiver ativa.",
        "flaggedAppeal": "Se for um engano — por exemplo, um navegador rígido, VPN ou filtro DNS — toque em \"Recorrer desta decisão\" abaixo e nossa equipe analisará seu caso.",
        "detected": "Detectado",
        "serverVerified": "Verificado pelo servidor",
        "clientDetection": "Detecção do cliente",
        "appealTitle": "Recorrer desta decisão",
        "appealProcessing": "Processando recurso...",
        "appealAccepted": "Recurso aceito! Atualizando...",
        "appealRejected": "Recurso rejeitado. Entre em contato com o suporte.",
        "refreshAfterChanges": "Atualize a página após fazer as alterações",
        "refreshAfterDisabling": "Atualize a página após desativar",
        "disableAllBlockers": "Verifique se há vários bloqueadores de anúncios - desative todos",
        "routerAdblock": "Verifique as configurações do roteador por recursos de bloqueio de anúncios",
        "dnsWhitelist": "Se usa Pi-hole, AdGuard Home ou NextDNS, adicione este domínio à lista de permissões",
    },
    "ru": {
        "accountFlagged": "Аккаунт помечен",
        "flaggedBody": "Ваш аккаунт помечен за постоянное использование блокировщика рекламы. Заработок, вывод средств и бонусы приостановлены, пока отметка активна.",
        "flaggedAppeal": "Если это ошибка — например, строгий браузер, VPN или DNS-фильтр — нажмите «Обжаловать это решение» ниже, и наша команда рассмотрит ваш случай.",
        "detected": "Обнаружено",
        "serverVerified": "Подтверждено сервером",
        "clientDetection": "Обнаружение клиентом",
        "appealTitle": "Обжаловать это решение",
        "appealProcessing": "Обработка апелляции...",
        "appealAccepted": "Апелляция принята! Обновление...",
        "appealRejected": "Апелляция отклонена. Обратитесь в поддержку.",
        "refreshAfterChanges": "Обновите страницу после внесения изменений",
        "refreshAfterDisabling": "Обновите страницу после отключения",
        "disableAllBlockers": "Проверьте наличие нескольких блокировщиков рекламы - отключите все",
        "routerAdblock": "Проверьте настройки роутера на наличие функций блокировки рекламы",
        "dnsWhitelist": "Если используете Pi-hole, AdGuard Home или NextDNS, добавьте этот домен в белый список",
    },
    "th": {
        "accountFlagged": "บัญชีถูกทำเครื่องหมาย",
        "flaggedBody": "บัญชีของคุณถูกทำเครื่องหมายจากการใช้ตัวบล็อกโฆษณาอย่างต่อเนื่อง รายได้ การถอน และโบนัสถูกหยุดชั่วคราวตราบเท่าที่เครื่องหมายนี้ยังใช้งานอยู่",
        "flaggedAppeal": "หากนี่เป็นข้อผิดพลาด — เช่น เบราว์เซอร์ที่เข้มงวด VPN หรือตัวกรอง DNS — แตะ \"อุทธรณ์การตัดสินใจนี้\" ด้านล่าง และทีมงานของเราจะตรวจสอบกรณีของคุณ",
        "detected": "ตรวจพบ",
        "serverVerified": "ยืนยันโดยเซิร์ฟเวอร์",
        "clientDetection": "การตรวจจับฝั่งไคลเอนต์",
        "appealTitle": "อุทธรณ์การตัดสินใจนี้",
        "appealProcessing": "กำลังดำเนินการอุทธรณ์...",
        "appealAccepted": "อุทธรณ์ได้รับการอนุมัติ! กำลังโหลดใหม่...",
        "appealRejected": "อุทธรณ์ถูกปฏิเสธ โปรดติดต่อฝ่ายสนับสนุน",
        "refreshAfterChanges": "รีเฟรชหน้าหลังจากทำการเปลี่ยนแปลง",
        "refreshAfterDisabling": "รีเฟรชหน้าหลังปิดตัวบล็อก",
        "disableAllBlockers": "ตรวจสอบตัวบล็อกโฆษณาหลายตัว - ปิดทั้งหมด",
        "routerAdblock": "ตรวจสอบการตั้งค่าเราเตอร์หากมีฟีเจอร์บล็อกโฆษณา",
        "dnsWhitelist": "หากใช้ Pi-hole, AdGuard Home หรือ NextDNS ให้เพิ่มโดเมนนี้ในรายการที่อนุญาต",
    },
    "tr": {
        "accountFlagged": "Hesap işaretlendi",
        "flaggedBody": "Hesabınız, reklam engelleyiciyi sürekli kullanmanız nedeniyle işaretlendi. Bu işaret etkinken kazançlar, para çekme işlemleri ve bonuslar duraklatıldı.",
        "flaggedAppeal": "Bu bir hataysa — örneğin katı bir tarayıcı, VPN veya DNS filtresi — aşağıdaki \"Bu karara itiraz et\" seçeneğine dokunun, ekibimiz durumunuzu inceleyecek.",
        "detected": "Algılandı",
        "serverVerified": "Sunucu tarafından doğrulandı",
        "clientDetection": "İstemci algılaması",
        "appealTitle": "Bu karara itiraz et",
        "appealProcessing": "İtiraz işleniyor...",
        "appealAccepted": "İtiraz kabul edildi! Yenileniyor...",
        "appealRejected": "İtiraz reddedildi. Lütfen destekle iletişime geçin.",
        "refreshAfterChanges": "Değişiklikleri yaptıktan sonra sayfayı yenileyin",
        "refreshAfterDisabling": "Devre dışı bıraktıktan sonra sayfayı yenileyin",
        "disableAllBlockers": "Birden fazla reklam engelleyici olup olmadığını kontrol edin - hepsini devre dışı bırakın",
        "routerAdblock": "Reklam engelleme özellikleri için yönlendirici ayarlarınızı kontrol edin",
        "dnsWhitelist": "Pi-hole, AdGuard Home veya NextDNS kullanıyorsanız bu alan adını beyaz listeye ekleyin",
    },
    "uk": {
        "accountFlagged": "Обліковий запис позначено",
        "flaggedBody": "Ваш обліковий запис позначено за постійне використання блокувальника реклами. Заробіток, виведення коштів і бонуси призупинені, доки ця позначка активна.",
        "flaggedAppeal": "Якщо це помилка — наприклад, суворий браузер, VPN чи DNS-фільтр — торкніться «Оскаржити це рішення» нижче, і наша команда розгляне ваш випадок.",
        "detected": "Виявлено",
        "serverVerified": "Підтверджено сервером",
        "clientDetection": "Виявлення клієнтом",
        "appealTitle": "Оскаржити це рішення",
        "appealProcessing": "Обробка оскарження...",
        "appealAccepted": "Оскарження прийнято! Оновлення...",
        "appealRejected": "Оскарження відхилено. Зверніться до підтримки.",
        "refreshAfterChanges": "Оновіть сторінку після внесення змін",
        "refreshAfterDisabling": "Оновіть сторінку після вимкнення",
        "disableAllBlockers": "Перевірте, чи немає кількох блокувальників реклами - вимкніть усі",
        "routerAdblock": "Перевірте налаштування роутера на наявність функцій блокування реклами",
        "dnsWhitelist": "Якщо використовуєте Pi-hole, AdGuard Home або NextDNS, додайте цей домен до білого списку",
    },
    "vi": {
        "accountFlagged": "Tài khoản bị đánh dấu",
        "flaggedBody": "Tài khoản của bạn bị đánh dấu do sử dụng trình chặn quảng cáo liên tục. Thu nhập, rút tiền và phần thưởng bị tạm dừng khi dấu này còn hiệu lực.",
        "flaggedAppeal": "Nếu đây là nhầm lẫn — ví dụ trình duyệt bảo mật cao, VPN hoặc bộ lọc DNS — hãy nhấn \"Kháng cáo quyết định này\" bên dưới và đội ngũ của chúng tôi sẽ xem xét trường hợp của bạn.",
        "detected": "Đã phát hiện",
        "serverVerified": "Đã xác minh bởi máy chủ",
        "clientDetection": "Phát hiện phía máy khách",
        "appealTitle": "Kháng cáo quyết định này",
        "appealProcessing": "Đang xử lý kháng cáo...",
        "appealAccepted": "Kháng cáo được chấp nhận! Đang tải lại...",
        "appealRejected": "Kháng cáo bị từ chối. Vui lòng liên hệ bộ phận hỗ trợ.",
        "refreshAfterChanges": "Tải lại trang sau khi thay đổi",
        "refreshAfterDisabling": "Tải lại trang sau khi tắt trình chặn",
        "disableAllBlockers": "Kiểm tra nhiều trình chặn quảng cáo - tắt tất cả",
        "routerAdblock": "Kiểm tra cài đặt bộ định tuyến để tìm tính năng chặn quảng cáo",
        "dnsWhitelist": "Nếu dùng Pi-hole, AdGuard Home hoặc NextDNS, hãy thêm tên miền này vào danh sách cho phép",
    },
    "zh": {
        "accountFlagged": "账号已被标记",
        "flaggedBody": "您的账号因持续使用广告拦截器而被标记。在此标记生效期间，收益、提现和奖励均被暂停。",
        "flaggedAppeal": "如果这是误判 — 例如过于严格的浏览器、VPN 或 DNS 过滤器 — 请点击下方的“对此决定提出申诉”，我们的团队将审核您的情况。",
        "detected": "已检测到",
        "serverVerified": "服务器已验证",
        "clientDetection": "客户端检测",
        "appealTitle": "对此决定提出申诉",
        "appealProcessing": "正在处理申诉...",
        "appealAccepted": "申诉已通过！正在刷新...",
        "appealRejected": "申诉被驳回。请联系支持团队。",
        "refreshAfterChanges": "更改后请刷新页面",
        "refreshAfterDisabling": "禁用后请刷新页面",
        "disableAllBlockers": "检查是否有多个广告拦截器 - 请全部禁用",
        "routerAdblock": "检查路由器设置中是否有广告拦截功能",
        "dnsWhitelist": "如果您使用 Pi-hole、AdGuard Home 或 NextDNS，请将此域名加入白名单",
    },
}

BSLASH = chr(92)

for loc, fills in FILLS.items():
    path = NS / loc / "adblock.ts"
    if not path.exists():
        print(f"{loc}: MISSING FILE")
        continue
    src = path.read_text(encoding="utf-8")
    # Find the object closer by brace counting from the first `{`.
    opener = re.search(r"export (?:default|const adblock) ?=? \{", src)
    if not opener:
        print(f"{loc}: opener not found")
        continue
    i = src.index("{", opener.start())
    depth = 0
    in_str = False
    close = -1
    while i < len(src):
        c = src[i]
        if in_str:
            if c == BSLASH:
                i += 2
                continue
            if c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    close = i
                    break
        i += 1
    if close == -1:
        print(f"{loc}: unbalanced braces")
        continue
    interior = src[src.index("{", opener.start()) + 1:close]
    already = set(re.findall(r"\n\s+([a-zA-Z0-9_]+):", interior))
    additions = []
    for k, v in fills.items():
        if k in already:
            continue
        safe_v = v.replace(BSLASH, BSLASH + BSLASH).replace('"', BSLASH + '"')
        additions.append(f'  {k}: "{safe_v}",')
    if not additions:
        print(f"{loc}: nothing to add")
        continue
    insert = "\n" + "\n".join(additions)
    src = src[:close] + insert + src[close:]
    path.write_text(src, encoding="utf-8")
    print(f"{loc}: +{len(additions)} keys")
