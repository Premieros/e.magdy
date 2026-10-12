'use client'

// Visible fallback for runtime initialization problems. Never expose error strings,
// stack traces, DB hosts, identities, or deployment environment variables.
export default function GlobalError({ reset }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin:0, minHeight:'100vh', display:'grid', placeItems:'center', background:'#f8fafc',
         color:'#0f172a', fontFamily:'Arial, sans-serif' }}>
        <main style={{width:'min(92vw, 520px)', padding:32, background:'#fff',
           border:'1px solid #e2e8f0', borderRadius:18, boxShadow:'0 8px 24px #0f172a0a'}}>
          <div style={{color:'#64748b',fontWeight:700,fontSize:13}}>PREMIEROS GARMENTS</div>
          <h1 style={{fontSize:27,margin:'16px 0'}}>البرنامج منشور، لكن الخادم لم يجهز بعد</h1>
          <p style={{lineHeight:1.9,color:'#475569'}}>
            حدث خطأ أثناء تحميل النظام. قد يكون الاتصال أو تهيئة قاعدة البيانات غير مكتملين.
            لن يتم عرض بيانات المصنع قبل التأكد من جاهزية الخدمة.
          </p>
          <button type="button" onClick={() => reset()} style={{border:0,borderRadius:10,background:'#0f172a',
            color:'#fff',fontSize:15,padding:'13px 20px',cursor:'pointer'}}>إعادة المحاولة</button>
          <p style={{fontSize:14,marginTop:20}}>
            <a href="/api/garments-health" style={{color:'#1d4ed8'}}>فحص حالة قاعدة البيانات</a>
          </p>
        </main>
      </body>
    </html>
  )
}
