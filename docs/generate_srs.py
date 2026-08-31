# -*- coding: utf-8 -*-
"""Generate a complete IEEE-style SRS Word document for Smart Profits."""
from __future__ import annotations

from datetime import date

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

TEAL = RGBColor(15, 122, 116)
DARK = RGBColor(11, 17, 32)
GOLD = RGBColor(168, 130, 28)
GRAY = RGBColor(71, 85, 105)
WHITE = RGBColor(255, 255, 255)
ROW_ALT = "F3F7FB"
HEADER_BG = "0F7A74"


def shade(cell, hex_color: str) -> None:
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color)
    shd.set(qn("w:val"), "clear")
    tcPr.append(shd)


def set_rtl_p(p) -> None:
    pPr = p._p.get_or_add_pPr()
    bidi = OxmlElement("w:bidi")
    bidi.set(qn("w:val"), "1")
    pPr.append(bidi)
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.line_spacing = 1.18


def set_run_font(run, size=12, bold=False, color=DARK, italic=False) -> None:
    run.bold = bold
    run.italic = italic
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.name = "Arial"
    r = run._element
    rPr = r.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:ascii"), "Arial")
    rFonts.set(qn("w:hAnsi"), "Arial")
    rFonts.set(qn("w:cs"), "Arial")
    rFonts.set(qn("w:eastAsia"), "Arial")
    cs = rPr.find(qn("w:cs"))
    if cs is None:
        cs = OxmlElement("w:cs")
        rPr.append(cs)
    cs.set(qn("w:val"), "1")


def add_p(doc, text, size=12, bold=False, color=DARK, space=8, center=False, italic=False):
    p = doc.add_paragraph()
    set_rtl_p(p)
    if center:
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(space)
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold, color=color, italic=italic)
    return p


def add_h(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    set_rtl_p(p)
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for run in p.runs:
        set_run_font(run, size={1: 20, 2: 16, 3: 13}.get(level, 12), bold=True, color=TEAL if level < 3 else GOLD)
    p.paragraph_format.space_before = Pt(16 if level == 1 else 12)
    p.paragraph_format.space_after = Pt(8)
    return p


def add_bullets(doc, items, numbered=False):
    for i, item in enumerate(items, 1):
        p = doc.add_paragraph()
        set_rtl_p(p)
        p.paragraph_format.right_indent = Cm(0)
        p.paragraph_format.left_indent = Cm(0.4)
        prefix = f"{i}. " if numbered else "• "
        run = p.add_run(prefix + item)
        set_run_font(run, size=12)


def add_req(doc, code, title, text, priority="أساسي"):
    p = doc.add_paragraph()
    set_rtl_p(p)
    r1 = p.add_run(f"{code} — {title} ")
    set_run_font(r1, size=12, bold=True, color=TEAL)
    r2 = p.add_run(f"[{priority}]")
    set_run_font(r2, size=10, bold=True, color=GOLD)
    add_p(doc, text, size=12, space=10)


def add_table(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = ""
        p = cell.paragraphs[0]
        set_rtl_p(p)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(h)
        set_run_font(run, size=10, bold=True, color=WHITE)
        shade(cell, HEADER_BG)
    for r_i, row in enumerate(rows):
        for c_i, val in enumerate(row):
            cell = table.rows[r_i + 1].cells[c_i]
            cell.text = ""
            p = cell.paragraphs[0]
            set_rtl_p(p)
            run = p.add_run(str(val))
            set_run_font(run, size=10, color=DARK)
            if r_i % 2 == 1:
                shade(cell, ROW_ALT)
    doc.add_paragraph()


def set_cell_border(cell):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement("w:tcBorders")
    for edge in ("top", "left", "bottom", "right"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "single")
        el.set(qn("w:sz"), "4")
        el.set(qn("w:color"), "94A3B8")
        tcBorders.append(el)
    tcPr.append(tcBorders)


def build() -> Document:
    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21.0)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)
    sectPr = section._sectPr
    pgSz = sectPr.find(qn("w:pgSz"))
    if pgSz is not None:
        pgSz.set(qn("w:orient"), "portrait")
    bidi = OxmlElement("w:bidi")
    bidi.set(qn("w:val"), "1")
    sectPr.append(bidi)

    styles = doc.styles["Normal"]
    styles.font.name = "Arial"
    styles.font.size = Pt(12)
    styles.font.color.rgb = DARK
    styles._element.rPr.rFonts.set(qn("w:cs"), "Arial")

    # Header / footer
    header = section.header.paragraphs[0]
    set_rtl_p(header)
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    rh = header.add_run("Smart Profits  |  مواصفة متطلبات البرمجيات (SRS)  |  الإصدار 1.0")
    set_run_font(rh, size=9, color=GRAY)
    footer = section.footer.paragraphs[0]
    set_rtl_p(footer)
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rf = footer.add_run("سري للفريق الأكاديمي/المشروع  •  © 2026 Smart Profits  •  صفحة ")
    set_run_font(rf, size=9, color=GRAY)
    # PAGE field
    fld = OxmlElement("w:fldChar")
    fld.set(qn("w:fldCharType"), "begin")
    footer._p.append(fld)

    # ===== COVER =====
    for _ in range(2):
        doc.add_paragraph()
    add_p(doc, "وثيقة مواصفات متطلبات البرمجيات", size=14, bold=True, color=GOLD, center=True, space=4)
    add_p(doc, "Software Requirements Specification (SRS)", size=13, color=GRAY, center=True, space=18)
    add_p(doc, "Smart Profits", size=32, bold=True, color=TEAL, center=True, space=6)
    add_p(doc, "سمارت بروفتس — مستشار التاجر الذكي", size=18, bold=True, color=DARK, center=True, space=10)
    add_p(
        doc,
        "منصة SaaS ثنائية اللغة لتحليل ملفات المتجر الفوضوية، تشخيص الربح الحقيقي، ومحاكاة القرار، مع حماية Smart Guard عبر واجهات GSMA CAMARA / Nokia Network-as-Code",
        size=12,
        color=GRAY,
        center=True,
        space=22,
    )
    add_table(
        doc,
        ["البند", "القيمة"],
        [
            ["اسم المشروع", "Smart Profits (سمارت بروفتس)"],
            ["نوع الوثيقة", "Software Requirements Specification — IEEE 830 adapted"],
            ["الإصدار", "1.0"],
            ["التاريخ", date.today().strftime("%Y-%m-%d")],
            ["الحالة", "معتمدة للتسليم الأكاديمي / الهاكاثون"],
            ["المنصة الحية", "https://smart-profits-ruddy.vercel.app"],
            ["المستودع", "https://github.com/BITSANDBYTESDUDE/Smart-Profits"],
            ["التقنية", "Next.js 16 • React 19 • TypeScript • Tailwind CSS 4"],
            ["اللغات", "العربية (RTL) + الإنجليزية (LTR)"],
            ["المؤسِّسة / صاحبة المنتج", "إسراء نائل حمد (Israa Nael Hamad)"],
            ["الثيم (هاكاثون GSMA)", "Theme 4 — Secure FinTech, Payments & Anti-Fraud"],
        ],
    )
    add_p(doc, "هذه الوثيقة تغطي كل جزء من المنتج كما هو منفَّذ في الشيفرة، وليست ملخصاً تسويقياً فقط.", size=11, italic=True, color=GRAY, center=True)

    doc.add_page_break()

    # ===== TOC =====
    add_h(doc, "جدول المحتويات", 1)
    toc = [
        "1. المقدمة",
        "2. الغرض من الوثيقة ونطاق النظام",
        "3. التعريفات والمختصرات والمراجع",
        "4. وصف المنتج العام",
        "5. فئات المستخدمين وحالات الاستخدام",
        "6. القيود والافتراضات والاعتماديات",
        "7. المعمارية والواجهات الخارجية",
        "8. المتطلبات الوظيفية — الحساب والواجهة",
        "9. المتطلبات الوظيفية — رفع الملفات والاستخراج",
        "10. المتطلبات الوظيفية — المحرك المالي",
        "11. المتطلبات الوظيفية — لوحة التحكم والتشخيص",
        "12. المتطلبات الوظيفية — محاكي القرار والتوقعات",
        "13. المتطلبات الوظيفية — المستشار المعرفي",
        "14. المتطلبات الوظيفية — التقارير والإعدادات",
        "15. المتطلبات الوظيفية — Smart Guard والأمن الشبكي",
        "16. المتطلبات الوظيفية — بوابة الإدارة Super Admin",
        "17. المتطلبات غير الوظيفية",
        "18. نموذج البيانات وتخزين الحالة",
        "19. واجهات برمجة التطبيقات (API)",
        "20. الأمان والخصوصية",
        "21. النشر والبيئات",
        "22. معايير القبول وسيناريوهات الاختبار",
        "23. الملحقات",
    ]
    add_bullets(doc, toc, numbered=False)

    # ===== 1 =====
    add_h(doc, "1. المقدمة", 1)
    add_p(
        doc,
        "Smart Profits منصة ويب لتاجر التجزئة الصغير والمتوسط في منطقة الشرق الأوسط وشمال أفريقيا. التاجر يعمل عادة من ملف Excel أو CSV أو PDF أو صورة غير منظمة، بلا مدير مالي، وبلا مركز عمليات أمنية. المنصة تحوّل هذا الملف إلى قرار: صحة المتجر، تسريب الربح، مخزون مبني على الربح، تسعير، خطة 30 يوماً، ومحاكاة «ماذا لو»، مع طبقة أمن Smart Guard تستعلم إشارات الشبكة (SIM Swap، Number Verification، Location Verification) قبل السماح برفع الملف أو تصدير التقرير أو تغيير السعر.",
    )
    add_p(
        doc,
        "المنتج ثنائي اللغة عربي/إنجليزي، يدعم الوضع الداكن والفاتح، ويعمل كتطبيق Next.js على المتصفح مع مسارات خادم للحسابات وSmart Guard. التحليل الأساسي للملف يجري في المتصفح حتى لا يُرفع دفتر اليومية إلى خادم أجنبي بلا داعٍ. النسخة التجريبية الحية منشورة على Vercel، والنسخة المحلية تعمل عبر npm run dev مع PostgreSQL اختياري عبر Docker.",
    )

    add_h(doc, "1.1 مشكلة العمل التي يحلّها النظام", 2)
    add_bullets(
        doc,
        [
            "العمى المالي: ملف المبيعات يخفي ربحاً وهمياً لأنه لا يتضمن الإيجار والرواتب والفواتير.",
            "فوضى الأعمدة: ملفات عربية وإنجليزية مختلطة، أوراق شهرية متعددة، وملخصات تكرر التفصيل.",
            "قرارات متأخرة: التاجر يحتاج ثلاث قرارات اليوم لا عشرين رسماً بيانياً.",
            "الاستيلاء على الحساب: تبديل شريحة SIM أو جلسة من موقع غير المتجر تسمح بسرقة ملف الربح أو تغيير الأسعار.",
            "غياب طبقة FinTech للتاجر: البنوك تشتري واجهات الشبكة، بينما منصات Excel للتاجر عادة لا تفعل.",
        ],
    )

    add_h(doc, "1.2 القيمة المقدَّمة (Value Proposition)", 2)
    add_p(
        doc,
        "من ملف Excel فوضوي إلى قرار تجاري: تشخيص صحة المتجر، كشف تسريب الربح، محاكاة السعر، وخطة 30 يوماً — محمي بذكاء الشبكة لا برسالة SMS وحدها.",
    )

    # ===== 2 =====
    add_h(doc, "2. الغرض من الوثيقة ونطاق النظام", 1)
    add_h(doc, "2.1 الغرض", 2)
    add_p(
        doc,
        "تثبيت متطلبات النظام كما هي منفَّذة في المستودع Smart-Profits لتكون مرجعاً للتطوير، الاختبار، التسليم الأكاديمي، وهاكاثون GSMA MENA Ignite Open Gateway (Nokia Network-as-Code). الوثيقة تصف السلوك المطلوب والحدود وما هو خارج النطاق.",
    )
    add_h(doc, "2.2 نطاق النظام (In Scope)", 2)
    add_bullets(
        doc,
        [
            "تسجيل التاجر، تسجيل الدخول، نسيان كلمة المرور، الملف الشخصي، ورقم الجوال بصيغة E.164.",
            "رفع وتحليل Excel (.xlsx/.xls) وCSV وPDF وصورة (PNG/JPG/WEBP) حتى 50 ميغابايت.",
            "اكتشاف الأعمدة عربي/إنجليزي، تنظيف الأرقام والتواريخ، دمج أوراق العمل، وتجاهل أوراق الملخص المكررة.",
            "حساب الإيراد، تكلفة البضاعة، التشغيل، الرواتب، التالف، صافي الربح، الهامش، ومؤشر الصحة 0–100.",
            "المصاريف الثابتة الخارجية (إيجار، رواتب، فواتير، تسويق) ونقطة التعادل والربح الحقيقي مقابل الوهمي.",
            "لوحة التحكم: مؤشرات، رسوم، مقارنة أشهر، طبيب المتجر، قرارات اليوم، تسريب الربح، رادار المخاطر، المخزون، التسعير، خطة 30 يوماً.",
            "محاكي القرار: ماذا لو للسعر/الخصم، ثلاثة سيناريوهات، توقّع أشهر قادمة، تنبيهات وتوصيات.",
            "سؤال المستشار عن الملف المفتوح ودروس مجال (تجارة، ربح، شراء، تسوّق، كتب).",
            "أرشيف ملفات لكل حساب، نطاق عرض حسب شهر/منتج/ورقة، عملات SAR/USD/AED/JOD/ILS.",
            "Smart Guard: Allow / Step-up / Freeze على تسجيل الدخول، رفع الملف، تصدير التقرير، تغيير السعر، إعادة كلمة المرور.",
            "محاكي Nokia CAMARA ومسار حي عند وجود NAC_API_KEY.",
            "بوابة Super Admin: نظرة عامة، خزينة، مستخدمون، حركة مرور.",
            "واجهة عربية RTL وإنجليزية LTR وسمات داكن/فاتح.",
        ],
    )
    add_h(doc, "2.3 خارج النطاق (Out of Scope) في الإصدار الحالي", 2)
    add_bullets(
        doc,
        [
            "بوابة دفع حقيقية (Stripe/HyperPay) واشتراك Pro مدفوع — الخطط موجودة كبيانات عرض (free/pro/business) وMRR يبقى صفراً ما لم تُمنح باقة يدوياً.",
            "تطبيق جوال أصلي (iOS/Android)؛ المنتج ويب متجاوب.",
            "محرك LLM خارجي (OpenAI) للإجابة؛ المستشار قاعدي (rule-based) على الملف والدروس المخزّنة.",
            "جرد مخزون فعلي من جهاز باركود؛ المخزون تقديري من سرعة البيع.",
            "محاسبة ضريبية رسمية (فاتورة إلكترونية / ZATCA) أو ربط ERP.",
            "تخزين دائم متعدد المناطق على Vercel بدون PostgreSQL سحابي؛ الجلسة والملفات تُحفظ محلياً في المتصفح مع طبقة خادم اختيارية.",
        ],
    )

    # ===== 3 =====
    add_h(doc, "3. التعريفات والمختصرات والمراجع", 1)
    add_h(doc, "3.1 المختصرات", 2)
    add_table(
        doc,
        ["المختصر", "المعنى"],
        [
            ["SRS", "Software Requirements Specification"],
            ["SaaS", "Software as a Service"],
            ["RTL / LTR", "اتجاه الكتابة يمين-يسار / يسار-يمين"],
            ["KPI", "مؤشر أداء رئيسي"],
            ["COGS", "تكلفة البضاعة المباعة"],
            ["OPEX", "مصاريف التشغيل"],
            ["P&L", "قائمة الدخل (ربح وخسارة)"],
            ["CSV / XLSX", "ملف نصي مفصول بفواصل / مصنف Excel"],
            ["OCR", "التعرف البصري على الحروف (للصور وPDF الممسوح)"],
            ["CAMARA", "مواصفات GSMA Open Gateway لواجهات الشبكة"],
            ["NaC", "Nokia Network-as-Code"],
            ["MSISDN / E.164", "رقم الجوال الدولي"],
            ["SIM Swap", "تغيير شريحة الهاتف حديثاً"],
            ["Number Verification", "تحقق شبكي أن الجهاز على الرقم المدعى"],
            ["Location Verification", "تحقق أن الجهاز داخل سياج جغرافي للمتجر"],
            ["Smart Guard", "وكيل القرار الأمني في المنصة"],
            ["NFR", "متطلب غير وظيفي"],
        ],
    )
    add_h(doc, "3.2 مصطلحات المنتج", 2)
    add_table(
        doc,
        ["المصطلح", "التعريف في Smart Profits"],
        [
            ["ربح وهمي (Phantom)", "المبيعات − تكلفة البضاعة فقط، دون الإيجار والرواتب والفواتير"],
            ["ربح حقيقي (Real)", "صافي الربح بعد خصم المصاريف الثابتة المدخلة"],
            ["طبيب المتجر", "لوحة صحة المتجر: درجة 0–100، عنوان، نتائج، ونافذة قرار بالأيام"],
            ["تسريب الربح", "منتج يبيع كثيراً بهامش ضعيف، أو تحت التكلفة، أو بتكلفة مرتفعة نسبة للسعر"],
            ["نقطة التعادل", "عدد القطع اللازمة لتغطية الثوابت قبل أي ربح صافٍ"],
            ["ملف تجريبي", "بيانات مولَّدة اسمها «بيانات تجريبية.csv» تظهر قبل أول رفع حقيقي"],
            ["Allow / Step-up / Freeze", "السماح، تحقق إضافي برمز شبكة، أو تجميد الإجراء الحساس"],
            ["نطاق العرض (Scope)", "تصفية التحليل حسب شهر و/أو منتج و/أو ورقة عمل"],
        ],
    )
    add_h(doc, "3.3 المراجع", 2)
    add_bullets(
        doc,
        [
            "IEEE Std 830-1998 — Recommended Practice for Software Requirements Specifications (هيكل مكيَّف).",
            "GSMA Open Gateway / CAMARA — SIM Swap, Number Verification, Location Verification.",
            "Nokia Network-as-Code developer portal (RapidAPI host: network-as-code.nokia.rapidapi.com).",
            "مستودع الشيفرة: github.com/BITSANDBYTESDUDE/Smart-Profits.",
            "وثائق الهاكاثون الداخلية: docs/hackathon.",
        ],
    )

    # ===== 4 =====
    add_h(doc, "4. وصف المنتج العام", 1)
    add_h(doc, "4.1 منظور المنتج", 2)
    add_p(
        doc,
        "المنتج تطبيق ويب مستقل (ليس إضافة Excel). الواجهة Next.js App Router. حالة التحليل تُحفظ لكل بريد في localStorage مع مفتاح مساحة عمل، ويمكن مزامنتها عبر /api/workspace. قرارات Smart Guard تُسجَّل في PostgreSQL إن وُجد DATABASE_URL، وإلا في ملف JSON آمن للكتابة (/tmp على Vercel أو data/ محلياً).",
    )
    add_h(doc, "4.2 الوظائف الكبرى", 2)
    add_table(
        doc,
        ["المجال", "الوظائف"],
        [
            ["الهوية", "تسجيل، دخول، ملف شخصي، جوال إلزامي، نسيان كلمة المرور بالبريد"],
            ["الملفات", "سحب وإفلات، قوالب CSV، دراسة الملف، أرشيف، حذف، اختيار ملف نشط"],
            ["التحليل", "KPIs، رسوم، صحة، تسريب، مخزون، تسعير، خطة، مقارنة أشهر"],
            ["المحاكاة", "ماذا لو، سيناريوهات ±15%، توقع، تنبيه، توصيات قابلة للتسجيل"],
            ["المستشار", "أسئلة عن الملف + دروس مجال بدون ملف"],
            ["التشغيل", "إيجار/رواتب/فواتير، تعادل، ربح حقيقي"],
            ["الأمن", "Smart Guard + محاكي/حي Nokia + سجل قرارات"],
            ["الإدارة", "نشاط، MRR، مستخدمون، احتفاظ، حركة ميزات"],
        ],
    )
    add_h(doc, "4.3 بيئة التشغيل", 2)
    add_bullets(
        doc,
        [
            "المتصفح: Chrome / Edge / Firefox حديث على سطح المكتب، مع دعم أساسي للجوال.",
            "الخادم: Node.js عبر Next.js 16، React 19، TypeScript.",
            "الاختياري: PostgreSQL 16 (Docker compose)، SMTP Gmail لنسيان كلمة المرور، مفتاح Nokia NaC للوضع الحي.",
        ],
    )

    # ===== 5 =====
    add_h(doc, "5. فئات المستخدمين وحالات الاستخدام", 1)
    add_h(doc, "5.1 الجهات الفاعلة", 2)
    add_table(
        doc,
        ["الممثل", "الوصف"],
        [
            ["التاجر (Merchant)", "صاحب المتجر؛ يستخدم التحليل والمستشار والمحاكي بعد إنشاء حساب برقم جوال"],
            ["مديرة المنصة (Super Admin)", "تدخل من /admin/login وتراقب الدخل والمستخدمين والاستخدام"],
            ["الزائر غير المسجّل", "يرى صفحات الدخول/التسجيل فقط؛ الصفحات الداخلية محمية"],
            ["Smart Guard Agent", "فاعل برمجي يقرر Allow/Step-up/Freeze قبل الإجراء الحساس"],
            ["شبكة Nokia NaC", "نظام خارجي (أو محاكيه) يعيد إشارات CAMARA"],
        ],
    )
    add_h(doc, "5.2 حالات الاستخدام الرئيسية", 2)
    add_table(
        doc,
        ["الرمز", "حالة الاستخدام", "الممثل", "النتيجة"],
        [
            ["UC-01", "إنشاء حساب", "تاجر", "جلسة + توجيه للوحة مع بيانات تجريبية"],
            ["UC-02", "تسجيل الدخول", "تاجر", "حماية Smart Guard ثم لوحة التحكم"],
            ["UC-03", "استعادة كلمة المرور", "تاجر", "إرسال بريد و/أو تعيين كلمة جديدة"],
            ["UC-04", "إدخال المصاريف الثابتة", "تاجر", "حساب ربح حقيقي وتعادل"],
            ["UC-05", "رفع ملف مالي", "تاجر", "تحليل بعد Allow من الحارس"],
            ["UC-06", "دراسة الملف", "تاجر", "تقرير تنظيف وأوراق ومنتجات"],
            ["UC-07", "تشخيص المتجر", "تاجر", "صحة، تسريب، خطة، مخزون، تسعير"],
            ["UC-08", "محاكاة سعر", "تاجر", "حكم ماذا لو + تطبيق محمي"],
            ["UC-09", "سؤال المستشار", "تاجر", "إجابة من الملف أو درس مجال"],
            ["UC-10", "تصدير تقرير شهري", "تاجر", "ملف بعد حماية الحارس"],
            ["UC-11", "تسجيل توصية في السجل", "تاجر", "عنصر في سجل الإجراءات"],
            ["UC-12", "تجميد إجراء مشبوه", "الحارس", "منع الرفع/التصدير/السعر"],
            ["UC-13", "تحقق Step-up", "تاجر", "رمز شبكة ثم السماح"],
            ["UC-14", "مراقبة المنصة", "مديرة", "KPIs ومستخدمون وحركة"],
            ["UC-15", "تعطيل تاجر / منحه Pro", "مديرة", "تغيير حالة أو باقة"],
        ],
    )

    # ===== 6 =====
    add_h(doc, "6. القيود والافتراضات والاعتماديات", 1)
    add_h(doc, "6.1 القيود", 2)
    add_bullets(
        doc,
        [
            "حجم الملف الأقصى 50 ميغابايت.",
            "الصيغ المدعومة: csv, xlsx, xls, pdf, png, jpg, jpeg, webp, bmp.",
            "كلمة المرور 6 أحرف على الأقل.",
            "رقم الجوال إلزامي عند التسجيل؛ الصيغة الدولية مثل +97059XXXXXXX أو محلي 059.",
            "سياج الموقع الافتراضي دائرة نصف قطرها 2000 متر حول إحداثيات المتجر أو غزة كافتراض (31.5017, 34.4668).",
            "اعتبار تبديل الشريحة «حديثاً» إذا وقع خلال 24 ساعة (SIM_SWAP_MAX_AGE_HOURS).",
            "Vercel: نظام ملفات التطبيق للقراءة فقط؛ الكتابة على /tmp أو الذاكرة أو PostgreSQL.",
        ],
    )
    add_h(doc, "6.2 الافتراضات", 2)
    add_bullets(
        doc,
        [
            "الملف يحتوي على صفوف تشبه جدول مبيعات أو مصروف (وليس عرضاً تقديمياً فارغاً).",
            "التاجر يستطيع منح إذن الموقع اختيارياً؛ إن رُفض تُعامل الإشارة كغير مؤكدة ويُطلب Step-up حسب السياسة.",
            "بدون NAC_API_KEY يعمل النظام في وضع simulator بمدخلات Nokia وهمية للهاكاثون.",
            "حساب الإدارة الافتراضي للعرض موجود في الشيفرة لبيئة التطوير/العرض.",
        ],
    )
    add_h(doc, "6.3 الاعتماديات الخارجية", 2)
    add_table(
        doc,
        ["الاعتماد", "الاستخدام", "إن غاب"],
        [
            ["المتصفح + JavaScript", "كل الواجهة والتحليل", "لا يعمل المنتج"],
            ["xlsx / papaparse / unpdf / tesseract.js", "قراءة الملفات", "فشل التحليل مع رسالة واضحة"],
            ["PostgreSQL", "سجل قرارات الحارس", "سجل ملف/ذاكرة"],
            ["SMTP (MAIL_USER)", "نسيان كلمة المرور بالبريد", "يمكن التعيين من الصفحة إن وُجد الحساب"],
            ["Nokia NaC", "إشارات حية", "محاكٍ داخلي"],
            ["Vercel", "الاستضافة العامة", "localhost:3000"],
        ],
    )

    # ===== 7 =====
    add_h(doc, "7. المعمارية والواجهات الخارجية", 1)
    add_h(doc, "7.1 الطبقات", 2)
    add_bullets(
        doc,
        [
            "طبقة العرض: app/(app) للتاجر، app/admin للمديرة، صفحات auth عامة. مكونات UI في components/.",
            "طبقة الحالة: context/auth-context، analysis-context، appearance، smart-guard-context، admin-auth.",
            "طبقة المحرك: lib/parser، mapping، classify، analytics، forecast، advisor، qa، opex، scope، localize-*.",
            "طبقة الأمن: lib/smart-guard/* تستدعي CAMARA عبر nac-client ثم decideSmartGuard.",
            "طبقة الخادم: app/api/* + lib/server (accounts، json-store، guard-log، workspaces، events، mail).",
        ],
    )
    add_h(doc, "7.2 خريطة الصفحات (التاجر)", 2)
    add_table(
        doc,
        ["المسار", "الصفحة", "المحتوى"],
        [
            ["/", "المدخل", "تحويل حسب الجلسة"],
            ["/register", "إنشاء حساب", "اسم، متجر، إيميل، جوال، كلمة مرور، موافقة شروط"],
            ["/login", "دخول", "إيميل وكلمة مرور + رابط إدارة"],
            ["/forgot-password", "نسيت كلمة المرور", "إرسال بريد وتعيين كلمة جديدة"],
            ["/dashboard", "لوحة التحكم والتشخيص", "KPIs وتشخيص كامل"],
            ["/data", "الملفات والبيانات", "رفع، دراسة ملف، أرشيف"],
            ["/simulator", "محاكي القرارات", "ماذا لو، سيناريوهات، توقع، توصيات"],
            ["/advisor", "اسأل المستشار", "محادثة + بطاقات مساعدة"],
            ["/settings", "التقارير والإعدادات", "المتجر، سجل الإجراءات، تقارير"],
            ["/upload /analysis /archive /ask /doctor /forecasts /actions /reports /help", "مسارات مساندة", "إعادة توجيه أو صفحات مكافئة ضمن التدفق"],
        ],
    )
    add_h(doc, "7.3 خريطة صفحات الإدارة", 2)
    add_table(
        doc,
        ["المسار", "الغرض"],
        [
            ["/admin/login", "دخول Super Admin"],
            ["/admin", "نظرة عامة: نشاط فريد، مستخدمون، MRR، ربح المنصة، رسوم"],
            ["/admin/financials", "الخزينة: دخل، تكاليف، معاملات"],
            ["/admin/users", "دليل التجار، خطط، تعطيل، تجربة Pro"],
            ["/admin/traffic", "حركة المرور واستخدام الميزات"],
        ],
    )
    add_h(doc, "7.4 الواجهة البشرية", 2)
    add_bullets(
        doc,
        [
            "شعار Smart Profits + عبارة «من ملف فوضوي إلى قرار ذكي».",
            "ألوان: فيروزي أساسي، ذهبي تمييز، خلفية داكنة #0b1120 أو فاتحة #f3f6fb.",
            "شريط جانبي بعرض 15rem (w-60) للتنقل والملفات.",
            "مبدّل لغة ع / EN ومبدّل داكن/فاتح في الرأس وصفحات الدخول.",
            "صفحات الدخول مقسومة: نموذج + لوحة علامة تجارية بشبكة ونص المستشار.",
        ],
    )

    # ===== 8 =====
    add_h(doc, "8. المتطلبات الوظيفية — الحساب والواجهة", 1)
    add_req(doc, "FR-AUTH-01", "إنشاء حساب", "يجب أن يجمع النموذج: الاسم الكامل، اسم المتجر، البريد، رقم الجوال، كلمة المرور (≥6)، وموافقة الشروط والخصوصية. عند النجاح تُحفظ الجلسة ويُوجَّه المستخدم إلى /dashboard.")
    add_req(doc, "FR-AUTH-02", "تحقق الجوال", "يُطبَّع الرقم إلى E.164. تُقبل صيغ 059xxxxxxxx و+970 وبدايات 972/966/971/962/20. الرقم مطلوب ولا يجوز ربطه بحسابين.")
    add_req(doc, "FR-AUTH-03", "تسجيل الدخول", "التحقق من البريد وكلمة المرور محلياً ثم عبر /api/auth/login إن لزم. يُستدعى Smart Guard بإجراء login قبل دخول اللوحة.")
    add_req(doc, "FR-AUTH-04", "نسيان كلمة المرور", "البحث عن الحساب. إن وُجد يُستدعى /api/auth/forgot-password لإرسال الكلمة عبر SMTP إن كان MAIL_USER مضبوطاً، مع إمكانية تعيين كلمة جديدة من الصفحة بعد حماية password_reset.")
    add_req(doc, "FR-AUTH-05", "الملف الشخصي", "من الإعدادات يمكن تعديل الاسم والمتجر والجوال وإحداثيات المتجر (homeLat/homeLng) عبر /api/auth/profile.")
    add_req(doc, "FR-UI-01", "اللغة", "التبديل الفوري بين ar وen يحفظ في localStorage (smartprofit-locale) ويضبط dir وlang على html. كل واجهة التاجر المعروضة تُترجم عبر lib/i18n.ts؛ أسماء المنتجات تبقى كما في الملف.")
    add_req(doc, "FR-UI-02", "السمة", "التبديل داكن/فاتح يُحفظ في smartprofit-theme ويطبق صنفي dark وlight.")
    add_req(doc, "FR-UI-03", "تخطيط التسجيل", "صفحة التسجيل تملأ ارتفاع الشاشة بدون تمرير عمودي على سطح المكتب: حقول الاسم/المتجر والإيميل/الجوال في صفين، مع حجم خط طبيعي.")
    add_req(doc, "FR-UI-04", "وضوح الوضع الداكن", "بطاقة الجانب في صفحات الدخول ذات إطار فيروزي وخلفية غير شفافة وشبكة ظاهرة في الدارك.")

    # ===== 9 =====
    add_h(doc, "9. المتطلبات الوظيفية — رفع الملفات والاستخراج", 1)
    add_req(doc, "FR-FILE-01", "منطقة الرفع", "سحب وإفلات أو اختيار ملف. الصيغ المعلنة Excel/CSV/PDF/صورة. قبل الاختيار تُعرض نافذة تجهيز المصاريف الثابتة (حفظ أو تخطي).")
    add_req(doc, "FR-FILE-02", "حماية الرفع", "لا يُحلَّل الملف ما لم يُرجع Smart Guard قرار allow لإجراء file_upload. Freeze يظهر طبقة منع. Step-up يطلب رمزاً شبكياً.")
    add_req(doc, "FR-FILE-03", "فشل الحارس لا يكسر التحليل على الاستضافة", "إذا تعذّر تقييم الحارس بسبب تخزين للقراءة فقط أو خطأ خادم، يُسمح بالمتابعة (fail-open) حتى لا تُحجب المنصة على Vercel، مع بقاء السياسة كاملة عندما يعمل التقييم.")
    add_req(doc, "FR-FILE-04", "قراءة CSV", "papaparse مع ترويسة، تجاهل الأسطر الفارغة، رسائل خطأ واضحة إن فشل التنسيق.")
    add_req(doc, "FR-FILE-05", "قراءة Excel", "xlsx يقرأ كل أوراق العمل cellDates. تُصنَّف الورقة تفصيل/ملخص/فارغة/متجاهلة. إن وُجد تفصيل يُتجاهل الملخص الذي يكرر الإيراد (±20%).")
    add_req(doc, "FR-FILE-06", "قراءة PDF", "استخراج جدول أو نص عبر unpdf؛ إن لزم OCR. نسخ ArrayBuffer لتفادي DataCloneError.")
    add_req(doc, "FR-FILE-07", "قراءة الصور", "tesseract.js يستخرج صفوفاً ثم نفس مسار ربط الأعمدة.")
    add_req(doc, "FR-FILE-08", "تنظيف القيم", "تحويل أرقام عربية/فارسية، إزالة ر.س و$ والفواصل و٪، ودعم السالب بين أقواس.")
    add_req(doc, "FR-FILE-09", "التواريخ", "Excel serial، ISO، يوم/شهر/سنة، أسماء أشهر عربية وإنجليزية، واستبعاد تواريخ غير منطقية للعمل (مثل 1970). يمكن اشتقاق الشهر من اسم الورقة.")
    add_req(doc, "FR-FILE-10", "ربط الأعمدة", " aliases عربية وإنجليزية للأدوار: date, product, sku, quantity, sellingPrice, costPrice, revenue, expense, category, expenseType, notes مع درجة ثقة.")
    add_req(doc, "FR-FILE-11", "تقرير الدراسة", "يعرض صفوفاً منظّفة، أعمدة مكتشفة، قيماً أصلحت، تكرارات حُذفت، سجلات مراجعة، منتجات، وتحذيرات مترجمة حسب اللغة، وجدول أوراق العمل.")
    add_req(doc, "FR-FILE-12", "الأرشيف", "كل ملف مرفوع يُحفظ كملف مساحة عمل غير تجريبي يمكن اختياره أو حذفه. عند حذف الكل يبقى التجريبي.")
    add_req(doc, "FR-FILE-13", "القالب", "تنزيل CSV عربي أو إنجليزي حسب اللغة.")
    add_req(doc, "FR-FILE-14", "حد الحجم", "رفض فوق 50MB برسالة FileParseError.")

    add_h(doc, "9.1 أعمدة القالب المقترحة", 2)
    add_table(
        doc,
        ["الدور", "أمثلة عربية", "أمثلة إنجليزية"],
        [
            ["التاريخ", "التاريخ، تاريخ الفاتورة، الشهر", "Date, Invoice Date, Period"],
            ["المنتج", "اسم المنتج، الصنف، البيان", "Product, Item, Description"],
            ["الكمية", "الكمية، العدد", "Quantity, Qty, Units"],
            ["سعر البيع", "سعر البيع، السعر", "Price, Selling Price"],
            ["التكلفة", "التكلفة، سعر التكلفة", "Cost, COGS"],
            ["المبيعات", "المبيعات، الإيراد", "Sales, Revenue"],
            ["المصروف", "المصروف، التشغيل", "Expense, Opex"],
        ],
    )

    # ===== 10 =====
    add_h(doc, "10. المتطلبات الوظيفية — المحرك المالي", 1)
    add_req(doc, "FR-ENG-01", "تصنيف الصف", "كل حركة تُصنَّف إلى bucket: revenue | cogs | opex | salaries | waste مع إمكانية تعلم يدوي (taxonomy) عندما يحتاج المصطلح مراجعة.")
    add_req(doc, "FR-ENG-02", "المتسلسل الشهري", "تجميع حسب السنة-الشهر: إيراد، COGS، OPEX، رواتب، تالف، مصروف كلي، صافي ربح.")
    add_req(doc, "FR-ENG-03", "KPIs", "إجمالي مبيعات، مصروفات، صافي ربح، هامش، تغير عن الفترة السابقة، مؤشر صحة 0–100 وتسمية: ممتاز / جيد جداً / متوسط / ضعيف / حرج.")
    add_req(doc, "FR-ENG-04", "المصاريف الثابتة", "rent, salaries, utilities, otherOpex. إن opexIncludedInFile=true لا تُضاف خارجياً. تُحسب قبل التحليل عبر النافذة.")
    add_req(doc, "FR-ENG-05", "الربح الحقيقي والوهمي", "الوهمي = إيراد − COGS. الحقيقي = صافي بعد الثوابت. يُعرض الفرق ونسبة التشغيل من المبيعات.")
    add_req(doc, "FR-ENG-06", "نقطة التعادل", "وحدات مطلوبة = ثوابت ÷ متوسط مساهمة القطعة. إن المساهمة ≤ 0 تُعلن استحالة التغطية قبل إصلاح السعر/التكلفة.")
    add_req(doc, "FR-ENG-07", "صحة التشغيل", "نغمات idle / bad / warn / good حسب نسبة الثوابت من المبيعات (حد صحي تقريبي تحت 30%).")
    add_req(doc, "FR-ENG-08", "المنتجات", "أداء لكل منتج: كمية، مرات بيع، إيراد، تكلفة، ربح، هامش، خسارة، اتجاه rising/stable/declining.")
    add_req(doc, "FR-ENG-09", "الراكد", "منتجات بلا حركة كافية مع توصية تصفية أو خصم 20%.")
    add_req(doc, "FR-ENG-10", "النطاق", "تصفية الحركات حسب monthKey وproduct وsheet دون إعادة رفع الملف.")
    add_req(doc, "FR-ENG-11", "العملات", "عرض SAR, USD, AED, JOD, ILS مع تحويل للعرض.")

    add_h(doc, "10.1 معادلات أساسية", 2)
    add_bullets(
        doc,
        [
            "إيراد الصف ≈ كمية × سعر بيع، أو عمود المبيعات إن وُجد.",
            "COGS الصف ≈ كمية × تكلفة.",
            "صافي الفترة = إيراد − (COGS + OPEX الملف + الثوابت إن لم تكن مضمّنة).",
            "الهامش % = صافي الربح ÷ الإيراد × 100.",
            "درجة الصحة: مزيج اتجاه المبيعات، الهامش، تركّز الربح، والخسارة المتوقعة (تفاصيل التنفيذ في lib/analytics.ts).",
        ],
    )

    # ===== 11 =====
    add_h(doc, "11. المتطلبات الوظيفية — لوحة التحكم والتشخيص", 1)
    add_req(doc, "FR-DASH-01", "حالة بلا ملف", "إن لم يُرفع ملف يظهر بطاقة تطلب الذهاب إلى البيانات؛ تُعرض بيانات تجريبية حتى أول ملف حقيقي.")
    add_req(doc, "FR-DASH-02", "بطاقات KPI", "مبيعات، مصروفات، ربح، حلقة الصحة. النقر يشرح المصدر (COGS، تشغيل، رواتب ملف، تالف).")
    add_req(doc, "FR-DASH-03", "رسوم", "إيراد مقابل مصروف (أعمدة إن كان شهراً واحداً)، دونات تصنيف المصروف مع ترجمة الشرائح، بدون نقاط تاريخ يناير 1970.")
    add_req(doc, "FR-DASH-04", "مقارنة الأشهر", "الأكثر/الأقل ربحية، جدول فترة/مبيعات/مصروف/صافي/تغيّر، وأسماء أشهر حسب لغة الواجهة.")
    add_req(doc, "FR-DASH-05", "طبيب المتجر", "درجة، تسمية مترجمة، عنوان حالة، حتى 3 نتائج (مبيعات، مزيج ربح، تكلفة، تركّز، SKUs خاسرة)، ونافذة أيام حتى ظهور الضغط.")
    add_req(doc, "FR-DASH-06", "ماذا أفعل اليوم؟", "حتى 3 قرارات: إيقاف شراء، مراجعة راكد، مراجعة سعر مسرب، إعادة تموين، دفع الرابحة — مع زر تنفيذ.")
    add_req(doc, "FR-DASH-07", "تسريب الأرباح", "قائمة منتجات مع مبيعات/ربح، وصف المشكلة، واقتراح (مثل رفع السعر 3).")
    add_req(doc, "FR-DASH-08", "رادار المخاطر", "محاور: ربح، مخزون، مصاريف، مبيعات، منتجات، جودة بيانات — مستوى مرتفع/متوسط/منخفض/جيد.")
    add_req(doc, "FR-DASH-09", "مخزون مبني على الربح", "مخزون تقديري، سرعة/يوم، أيام للنفاد، ربح القطعة، قرار: اطلب الآن / لا تشترِ / راقب.")
    add_req(doc, "FR-DASH-10", "تسعير ذكي", "سعر حالي، تكلفة، هامش، نطاق مقترح، وتحذير عدم الرفع دفعة واحدة إن انخفض الطلب.")
    add_req(doc, "FR-DASH-11", "خطة 30 يوماً", "أربعة أسابيع: تصحيح السعر والشراء، تعزيز الرابحة، ضغط المصروف، قياس النتيجة — مهام مرتبطة بالمنتجات.")
    add_req(doc, "FR-DASH-12", "الترجمة", "كل عناوين اللوحة والجمل المولَّدة المعروفة تُعرض بالإنجليزية عند اختيار EN عبر مفاتيح i18n ومُموضِع lib/localize-advisor.ts.")

    # ===== 12 =====
    add_h(doc, "12. المتطلبات الوظيفية — محاكي القرار والتوقعات", 1)
    add_req(doc, "FR-SIM-01", "ماذا لو", "اختيار منتج، وضع سعر جديد أو خصم نسبة، عرض السعر الحالي/الجديد، ربح القطعة، الربح الشهري المتوقع، الفرق، وحكم نصي حسب: تحت التكلفة، هامش <15%، انخفاض الربح، رفع >12%.")
    add_req(doc, "FR-SIM-02", "تطبيق السعر", "الزر يستدعي Smart Guard بإجراء price_change ثم يُظهر نجاح/فشل.")
    add_req(doc, "FR-SIM-03", "سيناريوهات", "أسوأ −15%، متوقع، أفضل +15% للإيراد والربح.")
    add_req(doc, "FR-SIM-04", "التوقع", "انحدار على آخر الأشهر لمسار إيراد متصل/متقطع، وربح الشهر القادم.")
    add_req(doc, "FR-SIM-05", "تنبيهات", "loss-next-month، sales-drop، opex-faster، margin-squeeze، أو healthy-trend — عنوان ورسالة وتوصية مترجمة.")
    add_req(doc, "FR-SIM-06", "توصيات الذكاء", "حتى توصيتين من: رفع الهامش، حماية الهامش، خفض طلبات المخزون، تعزيز الرابحة — مع تسجيل في سجل الإجراءات بعد الحارس.")

    add_h(doc, "12.1 أحكام محاكاة السعر", 2)
    add_table(
        doc,
        ["الشرط", "مفتاح الحكم"],
        [
            ["السعر الجديد ≤ التكلفة", "sim.v.belowCost"],
            ["الهامش الجديد < 15%", "sim.v.thin"],
            ["الربح الشهري ينخفض", "sim.v.down"],
            ["الرفع أكبر من 12% من السعر الحالي", "sim.v.raise"],
            ["غير ذلك", "sim.v.ok"],
        ],
    )

    # ===== 13 =====
    add_h(doc, "13. المتطلبات الوظيفية — المستشار المعرفي", 1)
    add_req(doc, "FR-ADV-01", "أسئلة الملف", "يجيب عن أعلى/أقل ربح أو مبيعات، كميات، تسريب، قرارات اليوم، خطة، شهر مسمى، منتج مسمى — من الملف المفتوح والنطاق.")
    add_req(doc, "FR-ADV-02", "عدم وراثة النية", "الأسئلة القصيرة الجديدة لا ترث نية السؤال السابق إلا بعلامات متابعة واضحة أو رمز محتوى واحد.")
    add_req(doc, "FR-ADV-03", "دروس المجال", "موضوعات shop, books, trade, profit, purchase تُكتشف قبل الوراثة وتعمل حتى بلا ملف.")
    add_req(doc, "FR-ADV-04", "المساعدة", "بطاقات تشرح الأعمدة المتوقعة ونصائح الاستخدام بالعربي/الإنجليزي.")
    add_req(doc, "FR-ADV-05", "اقتراحات سريعة", "أزرار مثل: مين أعلى منتج ربح؟ وين تسريب الربح؟ شو أعمل اليوم؟ بدي خطة تسويقية.")

    # ===== 14 =====
    add_h(doc, "14. المتطلبات الوظيفية — التقارير والإعدادات", 1)
    add_req(doc, "FR-SET-01", "تبويب المتجر", "اسم المتجر، المالك، العملة الافتراضية، الثوابت الأربعة، وإحداثيات المتجر للحارس.")
    add_req(doc, "FR-SET-02", "سجل الإجراءات", "كل توصية مُطبَّقة تُحفظ مع الملف والتاريخ والحالة applied/reviewed.")
    add_req(doc, "FR-SET-03", "التقارير", "قائمة أشهر مع الربح وزر تنزيل/طباعة. التصدير محمي بإجراء report_export.")
    add_req(doc, "FR-SET-04", "لوحات الحارس في الإعدادات", "لوحة تجريبية لتغيير إشارات Nokia الوهمية، ولوحة سجل القرارات.")
    add_req(doc, "FR-SET-05", "ترويسة التطبيق", "ترحيب باسم المتجر، الملف الحالي، اختيار ملف، عملة، شهر، منتج، أرشيف، رفع جديد، جرس السجل.")

    # ===== 15 =====
    add_h(doc, "15. المتطلبات الوظيفية — Smart Guard والأمن الشبكي", 1)
    add_p(
        doc,
        "Smart Guard هو وكيل قرار واحد. الواجهة لا تتفرع على إشارات CAMARA بنفسها؛ تجمع الإشارات ثم تستدعي decideSmartGuard التي تُرجع قراراً واحداً.",
    )
    add_h(doc, "15.1 الإجراءات الحساسة", 2)
    add_table(
        doc,
        ["الإجراء", "متى", "ارتباط الموقع", "ارتباط الهوية"],
        [
            ["login", "تسجيل الدخول", "لا", "نعم"],
            ["password_reset", "إعادة كلمة المرور", "لا", "نعم"],
            ["file_upload", "رفع ملف مالي", "نعم", "لا (إلا سياسة الشك)"],
            ["report_export", "تصدير تقرير", "نعم", "لا"],
            ["price_change", "تطبيق سعر/توصية سعر", "لا", "نعم"],
        ],
    )
    add_h(doc, "15.2 إشارات CAMARA المستخدمة", 2)
    add_table(
        doc,
        ["API", "المسار التعاقدي", "القرار الذي تغذّيه"],
        [
            ["SIM Swap Check", "/sim-swap/v1/check", "إن swapped خلال 24س → Freeze فوراً"],
            ["SIM Swap Date", "/sim-swap/v1/retrieve-date", "latestSimChange لحساب الساعات"],
            ["Number Verification", "/number-verification/v1/verify", "دخول/تغيير سعر بلا تحقق → Step-up"],
            ["Location Verification", "/location-verification/v1/verify", "دائرة 2000م؛ FALSE بمطابقة <40 → Freeze؛ PARTIAL أو مطابقة أعلى → Step-up"],
        ],
    )
    add_req(doc, "FR-SG-01", "سياسة القرار", "الترتيب: SIM حديث → تجميد؛ موقع صلب خاطئ → تجميد؛ لا جوال → Step-up؛ إن تم Step-up مسبقاً في الجلسة → Allow؛ هوية بلا تحقق رقم → Step-up؛ شك موقع ناعم أو موقع مجهول على رفع/تصدير → Step-up؛ شك مالي مع إشارات ضعيفة → Step-up؛ وإلا Allow.")
    add_req(doc, "FR-SG-02", "الوضع الحي مقابل المحاكي", "وجود NAC_API_KEY يفعّل الوضع live ضد RapidAPI Nokia. غيابه يستخدم nokia-mock مع سيناريوهات تجريبية قابلة للضبط لكل بريد.")
    add_req(doc, "FR-SG-03", "رمز الشبكة", "Step-up يرسل رمزاً عبر /api/smart-guard/step-up/send ويُؤكد بـ verify. ليس SMS OTP كلاسيكياً يُوثق به بعد تبديل الشريحة.")
    add_req(doc, "FR-SG-04", "السجل", "كل قرار يُدرج في guard_decisions (Postgres) أو JSON مع البريد، الإجراء، القرار، السبب، الإشارات، IP وUser-Agent.")
    add_req(doc, "FR-SG-05", "الواجهة", "طبقة overlay للتجميد والتحقق الإضافي. أزرار الرفع والتصدير وتغيير السعر تمر من protect() أولاً.")
    add_req(doc, "FR-SG-06", "تخزين آمن للاستضافة", "json-store يكتب على /tmp في Vercel وذاكرة العملية إن فشل القرص، حتى لا ينهار التقييم عند غياب users.json (الملف مستبعد من Git).")

    add_h(doc, "15.3 أسباب القرار (GuardReason)", 2)
    add_bullets(
        doc,
        [
            "clean — الإشارات متسقة والسماح.",
            "sim_swap — تبديل شريحة حديث؛ الجلسة تُجمَّد ولا يُوثق بـ OTP.",
            "location_mismatch — الجهاز بعيد عن المتجر بدرجة صلبة.",
            "location_soft — شك خفيف في الموقع.",
            "location_unknown — تعذر التحقق من الموقع.",
            "account_frozen — الحساب مجمّد مسبقاً.",
            "need_number_verification — كلمة المرور لا تكفي.",
            "missing_phone — لا يوجد رقم لتشغيل واجهات الشبكة.",
            "financial_risk — سياق مالي غير معتاد مع إشارات ضعيفة.",
        ],
    )

    # ===== 16 =====
    add_h(doc, "16. المتطلبات الوظيفية — بوابة الإدارة Super Admin", 1)
    add_req(doc, "FR-ADM-01", "دخول مستقل", "مسار /admin/login منفصل عن التاجر. بعد النجاح تُفتح /admin.")
    add_req(doc, "FR-ADM-02", "النظرة العامة", "نشاط فريد، مستخدمون نشطون، إيراد اشتراكات/MRR، صافي ربح المنصة، رسم دخل مقابل تكاليف، نمو مستخدمين، جدول نشاط حي من أحداث حقيقية (register, login, analyze, doctor, whatif, leak, upload_error).")
    add_req(doc, "FR-ADM-03", "الخزينة", "تفصيل دخل (اشتراكات، إضافات) وتكاليف (AI، استضافة، بوابات دفع، تسويق) وسجل فواتير بحالات success/failed/refunded. بدون بوابة دفع حقيقية تبقى المبالغ صفراً ما لم تُمنح باقة.")
    add_req(doc, "FR-ADM-04", "المستخدمون", "احتفاظ، تسرب، LTV، تقسيم free/pro/business، بحث، تصفية الحالة، عرض ملف، تعطيل، منح تجربة Pro.")
    add_req(doc, "FR-ADM-05", "الحركة", "استخدام الميزات من الأحداث الحقيقية بلا إحصاءات دول وهمية.")
    add_req(doc, "FR-ADM-06", "مصدر البيانات", "التجار الحقيقيون من التسجيل؛ لا حسابات وهمية في الجداول.")

    # ===== 17 =====
    add_h(doc, "17. المتطلبات غير الوظيفية", 1)
    add_req(doc, "NFR-01", "الأداء", "تحليل ملف آلاف الصفوف يجب أن يبقى في المتصفح دون تجميد أطول من بضع ثوانٍ على جهاز حديث. طلبات الحارس مهلة موقع ≈4 ثوانٍ.", "جودة")
    add_req(doc, "NFR-02", "التوفر", "الواجهة تعمل بدون PostgreSQL وبدون Nokia حي. البريد اختياري.", "جودة")
    add_req(doc, "NFR-03", "قابلية الاستخدام", "عربي أولاً، RTL صحيح، نصوص قرار قصيرة، ثلاث قرارات يومياً لا لوحة مزدحمة بلا معنى.", "جودة")
    add_req(doc, "NFR-04", "إمكانية الوصول اللغوي", "تبديل لغة يغطي العناوين والأحكام والتنبيهات والتوصيات وليس القائمة فقط.", "جودة")
    add_req(doc, "NFR-05", "الأمان", "لا تُرفع كلمات المرور في Git. .env وusers.json وworkspaces مستبعدة. الحارس لا يعتمد على SMS بعد SIM swap.", "أساسي")
    add_req(doc, "NFR-06", "الخصوصية", "تحليل الملف الافتراضي محلي في المتصفح. سجلات الحارس تخزن إشارات لا محتوى دفتر اليومية.", "أساسي")
    add_req(doc, "NFR-07", "قابلية النقل", "يعمل على Windows محلياً وعلى Vercel للإنتاج. Docker لقاعدة البيانات فقط.", "جودة")
    add_req(doc, "NFR-08", "الصيانة", "TypeScript صارم، مفاتيح i18n مركزية، سياسات الحارس في ملف واحد (policy.ts).", "جودة")
    add_req(doc, "NFR-09", "السعة", "أرشيف ملفات في المتصفح محدود بحصة localStorage؛ عند الامتلاء يُتجاهل الحفظ دون إسقاط الجلسة.", "جودة")
    add_req(doc, "NFR-10", "التوافق", "Next 16، React 19، متصفحات تدعم ES modules وFlex/Grid.", "جودة")

    # ===== 18 =====
    add_h(doc, "18. نموذج البيانات وتخزين الحالة", 1)
    add_h(doc, "18.1 كيانات التحليل (ذاكرة المتصفح)", 2)
    add_table(
        doc,
        ["الكيان", "حقول أساسية"],
        [
            ["AppSettings", "storeName, ownerName, defaultCurrency, rent, salaries, utilities, otherOpex, opexIncludedInFile, opexSetupCompleted"],
            ["Transaction", "date, product, sku, qty, prices, revenue, expense, bucket, sourceSheet, needsReview"],
            ["ParseResult", "transactions, mapping, cleaning, sheets, warnings, fileName"],
            ["AnalysisResult", "kpis, monthlySeries, forecast, advisor, products, stagnant, expenseBreakdown"],
            ["StoreHealth", "score, label, tone, headline, daysUntilProblem, findings"],
            ["TodayAction", "id, priority, title, reason, href"],
            ["ProfitLeak", "product, revenue, profit, issue, suggestion, extraProfitIfFixed"],
            ["InventoryAdvice", "estimatedStock, dailyVelocity, daysUntilStockout, decision"],
            ["WhatIfResult", "prices, unit/monthly profit, delta, verdictKey"],
            ["GuardVerdict", "decision, reason, summary, action, inputs, traces, at"],
            ["ActionLogEntry", "fileId, recommendationId, title, body, appliedAt, status"],
        ],
    )
    add_h(doc, "18.2 PostgreSQL — جدول الحارس", 2)
    add_p(doc, "يُنشأ تلقائياً إن وُجد DATABASE_URL:")
    add_bullets(
        doc,
        [
            "guard_decisions(id, email, phone, action, decision, reason, summary, sim_swap_recent, sim_swap_hours_ago, location_result, location_match, location_match_rate, number_verified, nac_mode, frozen_at, traces JSONB, ip, user_agent, created_at)",
            "فهارس على (email, created_at) و(decision, created_at).",
        ],
    )
    add_h(doc, "18.3 مفاتيح المتصفح", 2)
    add_bullets(
        doc,
        [
            "smartprofit-theme / smartprofit-locale",
            "جلسة المستخدم وحسابات التجار محلياً",
            "مساحة عمل لكل بريد: ملفات محلَّلة، إعدادات، سجل إجراءات، تصنيف مصطلحات",
            "أحداث المنصة للوحة الإدارة على الجهاز نفسه",
        ],
    )

    # ===== 19 =====
    add_h(doc, "19. واجهات برمجة التطبيقات (API)", 1)
    add_table(
        doc,
        ["الطريقة والمسار", "الغرض"],
        [
            ["POST /api/auth/register", "حفظ حساب تاجر على الخادم"],
            ["POST /api/auth/login", "تحقق الخادم للحساب"],
            ["POST /api/auth/profile", "تحديث الاسم/المتجر/الجوال/إحداثيات المتجر"],
            ["GET /api/auth/profile", "قراءة الملف الشخصي"],
            ["POST /api/auth/forgot-password", "إرسال كلمة المرور بالبريد"],
            ["POST /api/analyze", "تحليل ملف على الخادم (اختياري؛ المسار الأساسي في المتصفح)"],
            ["GET/POST /api/workspace", "حفظ/جلب مساحة العمل"],
            ["POST /api/track", "تسجيل أحداث المنصة"],
            ["POST /api/smart-guard/evaluate", "قرار الحارس"],
            ["POST /api/smart-guard/step-up/send", "إرسال رمز التحقق الشبكي"],
            ["POST /api/smart-guard/step-up/verify", "تأكيد الرمز وإعادة التقييم"],
            ["GET /api/smart-guard/logs", "سجل القرارات"],
            ["POST /api/smart-guard/demo", "ضبط إشارات المحاكي"],
            ["POST /api/nac/mock/gate", "بوابة موحدة للهاكاثون: مسموح/تحقق/تجميد"],
            ["POST /api/nac/sim-swap/v1/check", "عقد CAMARA — فحص التبديل"],
            ["POST /api/nac/sim-swap/v1/retrieve-date", "عقد CAMARA — تاريخ التبديل"],
            ["POST /api/nac/number-verification/v1/verify", "عقد CAMARA — تحقق الرقم"],
            ["POST /api/nac/location-verification/v1/verify", "عقد CAMARA — تحقق الموقع"],
            ["GET /api/nac", "وصف وضع NaC"],
            ["GET /api/admin/snapshot", "لقطة لوحة الإدارة"],
            ["POST /api/admin/users", "إجراءات على التجار"],
        ],
    )

    add_h(doc, "19.1 متغيرات البيئة", 2)
    add_table(
        doc,
        ["المتغير", "الدور"],
        [
            ["DATABASE_URL", "اتصال PostgreSQL لسجل الحارس"],
            ["NAC_API_KEY", "مفتاح RapidAPI لوضع Nokia الحي"],
            ["NAC_RAPIDAPI_HOST", "network-as-code.nokia.rapidapi.com افتراضياً"],
            ["NAC_BASE_URL", "https://network-as-code.p-eu.rapidapi.com افتراضياً"],
            ["APP_URL", "رابط التطبيق للبريد"],
            ["MAIL_HOST / MAIL_PORT", "smtp.gmail.com / 587"],
            ["MAIL_USER / MAIL_APP_PASSWORD", "حساب إرسال نسيان كلمة المرور"],
            ["VERCEL", "يضبط مسار الكتابة على /tmp"],
        ],
    )

    # ===== 20 =====
    add_h(doc, "20. الأمان والخصوصية", 1)
    add_bullets(
        doc,
        [
            "كلمات المرور تُحفظ مع الحساب؛ لا تُرفع إلى Git (.env وdata/users.json في gitignore).",
            "الإجراءات المالية الحساسة لا تكتمل قبل حلقة الحارس.",
            "بعد SIM swap لا تُعتبر رسالة SMS دليلاً كافياً.",
            "تحقق الموقع يستخدم سياج المتجر لا تتبعاً مستمراً للجمهور.",
            "فشل البنية التحتية للحارس على Vercel لا يجوز أن يحذف بيانات التاجر المحلية؛ التحليل يبقى في المتصفح.",
            "لوحة الإدارة منفصلة ولا تستخدم جلسة التاجر.",
        ],
    )

    # ===== 21 =====
    add_h(doc, "21. النشر والبيئات", 1)
    add_h(doc, "21.1 التطوير المحلي", 2)
    add_bullets(
        doc,
        [
            "npm install ثم npm run dev → http://localhost:3000",
            "اختياري: npm run db:up لتشغيل Postgres 16 على المنفذ 5432 بمستخدم smartprofit.",
            "إنشاء حساب من /register ثم رفع Excel/CSV.",
        ],
    )
    add_h(doc, "21.2 الإنتاج (Vercel)", 2)
    add_bullets(
        doc,
        [
            "الربط مع فرع main في GitHub ينشر تلقائياً إلى smart-profits-ruddy.vercel.app.",
            "بدون PostgreSQL سحابي يعمل التحليل والحساب في المتصفح؛ سجل الحارس في /tmp/ذاكرة.",
            "لتفعيل البريد وNokia الحي تُضاف المتغيرات في إعدادات Vercel (ليست من ملف .env المحلي).",
        ],
    )
    add_h(doc, "21.3 سكربتات", 2)
    add_table(
        doc,
        ["الأمر", "الوظيفة"],
        [
            ["npm run dev", "خادم التطوير"],
            ["npm run build / start", "بناء وتشغيل إنتاجي"],
            ["npm run lint", "فحص الشيفرة"],
            ["npm run db:up / db:down", "تشغيل/إيقاف Postgres عبر Docker Compose"],
        ],
    )
    add_h(doc, "21.4 أهم ملفات الشيفرة", 2)
    add_table(
        doc,
        ["الملف", "الدور"],
        [
            ["lib/parser.ts", "قراءة وتنظيف كل الصيغ"],
            ["lib/mapping.ts", "اكتشاف الأعمدة"],
            ["lib/analytics.ts", "KPIs والمتسلسل والمنتجات"],
            ["lib/forecast.ts", "التوقع والتنبيهات والتوصيات"],
            ["lib/advisor.ts", "الصحة، التسريب، المخزون، الخطة، ماذا لو"],
            ["lib/qa.ts + advisor-knowledge.ts", "المستشار"],
            ["lib/opex.ts", "الربح الحقيقي والتعادل"],
            ["lib/i18n.ts + localize-advisor.ts", "الترجمة"],
            ["lib/smart-guard/policy.ts", "دماغ Allow/Step-up/Freeze"],
            ["lib/smart-guard/camara.ts", "جمع إشارات Nokia"],
            ["lib/server/json-store.ts", "تخزين JSON متوافق مع Vercel"],
            ["context/analysis-context.tsx", "حالة الملفات والتحليل"],
        ],
    )

    # ===== 22 =====
    add_h(doc, "22. معايير القبول وسيناريوهات الاختبار", 1)
    add_table(
        doc,
        ["المعرّف", "السيناريو", "معيار القبول"],
        [
            ["AC-01", "تسجيل بحقول كاملة وجوال صالح", "حساب + دخول للوحة + بيانات تجريبية"],
            ["AC-02", "تسجيل بجوال مكرر", "رفض phone-taken"],
            ["AC-03", "رفع CSV بالقالب", "دراسة ملف بأرقام غير صفرية وKPI"],
            ["AC-04", "رفع Excel متعدد الأوراق", "استخدام التفصيل وتجاهل الملخص المكرر"],
            ["AC-05", "ملف بلا أعمدة مالية", "رسالة خطأ مفهومة لا انهيار صفحة"],
            ["AC-06", "إدخال إيجار ورواتب", "ظهور ربح حقيقي وتعادل"],
            ["AC-07", "تبديل EN على اللوحة والمحاكي", "العناوين والأحكام بالإنجليزية؛ أسماء المنتجات كما هي"],
            ["AC-08", "ماذا لو بسعر تحت التكلفة", "حكم belowCost وعدم التشجيع"],
            ["AC-09", "سؤال «وين تسريب الربح؟»", "قائمة من الملف لا تكرار إجابة سابقة خطأ"],
            ["AC-10", "Freeze من الحارس عند الرفع", "لا يُحفظ ملف جديد"],
            ["AC-11", "نشر Vercel بدون Postgres", "الرفع يعمل ولا يظهر خطأ غير متوقع بسبب القرص"],
            ["AC-12", "تسجيل صفحة على شاشة لابتوب", "النموذج كامل دون تمرير عمودي"],
            ["AC-13", "دخول مديرة", "لوحة أرقام من أحداث حقيقية"],
        ],
    )

    # ===== 23 =====
    add_h(doc, "23. الملحقات", 1)
    add_h(doc, "ملحق أ — تدفق رفع الملف", 2)
    add_bullets(
        doc,
        [
            "1) التاجر يضغط الرفع → Smart Guard file_upload.",
            "2) نافذة المصاريف الثابتة (حفظ/تخطي).",
            "3) اختيار الملف في المتصفح.",
            "4) parseFinancialFile حسب الامتداد.",
            "5) runFullAnalysis مع الإعدادات والتصنيف المتعلم.",
            "6) حفظ الملف في الأرشيف وتعيينه نشطاً.",
            "7) تتبع حدث analyze؛ عند الفشل حدث upload_error.",
        ],
        numbered=False,
    )
    add_h(doc, "ملحق ب — تدفق Smart Guard", 2)
    add_p(doc, "إجراء حسّاس → قراءة الجوال من الجلسة → (اختياري) إحداثيات الجهاز → Nokia حي أو محاكٍ: SIM Swap + Number + Location → decideSmartGuard → Allow يكمل / Step-up رمز شبكة / Freeze طبقة منع → كتابة السجل.")
    add_h(doc, "ملحق ج — قرارات المخزون", 2)
    add_table(
        doc,
        ["القرار", "الشرط التقريبي"],
        [
            ["dont_buy", "راكد أو سرعة منخفضة أو ربح قطعة ≤ 0"],
            ["order_now", "ينفد خلال ≤10 أيام وسرعة ≥0.15 وربح موجب"],
            ["watch", "الحركة متوسطة"],
        ],
    )
    add_h(doc, "ملحق د — حزم البرمجيات", 2)
    add_p(doc, "next 16.3.0، react 19.2.8، tailwindcss 4، recharts، framer-motion، lucide-react، papaparse، xlsx، unpdf، tesseract.js، zod، pg، nodemailer، sonner، react-dropzone، class-variance-authority، clsx، tailwind-merge.")
    add_h(doc, "ملحق هـ — سجل الإصدارات", 2)
    add_table(
        doc,
        ["الإصدار", "التاريخ", "الوصف"],
        [
            ["1.0", date.today().strftime("%Y-%m-%d"), "إصدار SRS كامل يغطي التحليل، المستشار، المحاكي، الحارس، الإدارة، النشر على Vercel، والترجمة ثنائية اللغة كما في المنتج الحي."],
        ],
    )

    add_h(doc, "24. الاعتماد", 1)
    add_p(doc, "أُعدّت هذه المواصفة من الشيفرة الفعلية لمستودع Smart Profits ومن سلوك المنتج المنشور. أي تعارض لاحق بين الوثيقة والشيفرة يُحسم لصالح الشيفرة مع تحديث هذه الوثيقة.")
    add_table(
        doc,
        ["الدور", "الاسم", "التوقيع", "التاريخ"],
        [
            ["مالكة المنتج / المطوّرة", "إسراء نائل حمد", "", ""],
            ["مراجع أكاديمي / مشرف", "", "", ""],
            ["مراجع تقني", "", "", ""],
        ],
    )

    return doc


def main() -> None:
    out = r"C:\Users\HP\OneDrive\Desktop\مساعد التحليل المالي\smart-profit\docs\SRS-Smart-Profits.docx"
    doc = build()
    doc.save(out)
    print(out)


if __name__ == "__main__":
    main()
