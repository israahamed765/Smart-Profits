# Smart Profits — كيف تراجعين الطلب

الأمان لا يأتي من توزيع الملفات وحده. راجعي كل طلب على هذا المسار:

```text
Frontend (UI / UX validation فقط)
   ↓ HTTPS
API Route (يبدأ الـFlow ولا يخزّن أسراراً)
   ↓
Middleware: rate limit → authentication → authorization
   ↓
Validator (Zod على الخادم)
   ↓
Service (Business Logic)
   ↓
Repository (Data Access)
   ↓
Database / json-store على الخادم
```

اسألي دائماً: **أين يمكن للمستخدم أن يتلاعب؟**

| طبقة | المجلد | ماذا يُسمح |
| --- | --- | --- |
| Frontend | `app/`, `components/`, `context/` | عرض، نماذج، طلبات. بلا كلمات سر، بلا JWT secret، بلا قواعد أمان |
| API | `app/api/` | استقبال الطلب وتشغيل الطبقات التالية |
| Middleware | `server/middleware/` + `middleware.ts` | جلسة، صلاحيات، حد محاولات |
| Validators | `server/validators/` | شكل البيانات على الخادم |
| Services | `server/services/` | تسجيل، خطط، تجميد حساب، إعادة تعيين كلمة المرور |
| Repositories | `server/repositories/` | قراءة/كتابة الحسابات ومساحات العمل |
| Secrets | `.env` (غير مرفوع) | `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `NAC_API_KEY` |
