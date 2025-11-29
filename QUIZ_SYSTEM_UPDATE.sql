-- ═══════════════════════════════════════════════════════
-- 🎓 تحديثات نظام الاختبارات والملخصات - MoTech Cloud v4.0
-- نسخ هذا الكود بالكامل والصقه في Supabase SQL Editor واضغط Run
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- 1️⃣ إنشاء جدول الاختبارات (quizzes)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quizzes (
    id BIGSERIAL PRIMARY KEY,
    quiz_name TEXT NOT NULL,
    telegram_file_id TEXT NOT NULL UNIQUE,
    source_file_id BIGINT REFERENCES files(id) ON DELETE CASCADE,
    source_file_name TEXT NOT NULL,
    question_count INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إضافة تعليقات توضيحية
COMMENT ON TABLE quizzes IS 'جدول تخزين الاختبارات المولدة يدوياً أو بالذكاء الاصطناعي';
COMMENT ON COLUMN quizzes.id IS 'المعرف الفريد للاختبار';
COMMENT ON COLUMN quizzes.quiz_name IS 'اسم الاختبار';
COMMENT ON COLUMN quizzes.telegram_file_id IS 'معرف ملف الاختبار (MD) في تيليجرام';
COMMENT ON COLUMN quizzes.source_file_id IS 'معرف الملف المصدر (من جدول files)';
COMMENT ON COLUMN quizzes.source_file_name IS 'اسم الملف المصدر';
COMMENT ON COLUMN quizzes.question_count IS 'عدد الأسئلة في الاختبار';
COMMENT ON COLUMN quizzes.total_score IS 'مجموع الدرجات الكلي';
COMMENT ON COLUMN quizzes.metadata IS 'بيانات إضافية (أنواع الأسئلة، الصعوبة، إلخ)';
COMMENT ON COLUMN quizzes.created_at IS 'تاريخ ووقت إنشاء الاختبار';
COMMENT ON COLUMN quizzes.updated_at IS 'تاريخ ووقت آخر تحديث';

-- إنشاء فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_quizzes_created_at ON quizzes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quizzes_source_file_id ON quizzes(source_file_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_quiz_name ON quizzes USING gin(to_tsvector('arabic', quiz_name));

-- إنشاء مشغل (Trigger) لتحديث updated_at
CREATE TRIGGER update_quizzes_updated_at
    BEFORE UPDATE ON quizzes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════
-- 2️⃣ تحديث جدول الملخصات (file_summaries)
-- ═══════════════════════════════════════════════════════

-- إضافة أعمدة جديدة
ALTER TABLE file_summaries ADD COLUMN IF NOT EXISTS summary_name TEXT;
ALTER TABLE file_summaries ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0;
ALTER TABLE file_summaries ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE file_summaries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- إضافة تعليقات توضيحية
COMMENT ON COLUMN file_summaries.summary_name IS 'اسم الملخص (اختياري)';
COMMENT ON COLUMN file_summaries.word_count IS 'عدد الكلمات في الملخص';
COMMENT ON COLUMN file_summaries.metadata IS 'بيانات إضافية (اللغة، نوع الملخص، إلخ)';

-- إنشاء فهرس للبحث
CREATE INDEX IF NOT EXISTS idx_summaries_summary_name ON file_summaries USING gin(to_tsvector('arabic', COALESCE(summary_name, '')));

-- إنشاء مشغر لتحديث updated_at
DROP TRIGGER IF EXISTS update_file_summaries_updated_at ON file_summaries;
CREATE TRIGGER update_file_summaries_updated_at
    BEFORE UPDATE ON file_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════
-- 3️⃣ إعداد سياسات RLS (Row Level Security)
-- ═══════════════════════════════════════════════════════

-- تفعيل RLS على جدول quizzes
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

-- سياسات للسماح بالعمليات العامة (يمكن تخصيصها لاحقاً)
CREATE POLICY "Allow public select on quizzes" ON quizzes
    FOR SELECT
    USING (true);

CREATE POLICY "Allow public insert on quizzes" ON quizzes
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public update on quizzes" ON quizzes
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow public delete on quizzes" ON quizzes
    FOR DELETE
    USING (true);

-- ═══════════════════════════════════════════════════════
-- 4️⃣ إنشاء Views للإحصائيات
-- ═══════════════════════════════════════════════════════

-- View لإحصائيات الاختبارات
CREATE OR REPLACE VIEW quizzes_stats AS
SELECT 
    COUNT(*) as total_quizzes,
    SUM(question_count) as total_questions,
    SUM(total_score) as total_possible_score,
    ROUND(AVG(question_count), 2) as avg_questions_per_quiz,
    MAX(created_at) as last_quiz_created,
    COUNT(DISTINCT source_file_id) as unique_source_files
FROM quizzes;

COMMENT ON VIEW quizzes_stats IS 'إحصائيات شاملة عن الاختبارات';

-- View لإحصائيات الملخصات
CREATE OR REPLACE VIEW summaries_stats AS
SELECT 
    COUNT(*) as total_summaries,
    SUM(word_count) as total_words,
    ROUND(AVG(word_count), 2) as avg_words_per_summary,
    MAX(created_at) as last_summary_created,
    COUNT(DISTINCT file_id) as unique_source_files
FROM file_summaries;

COMMENT ON VIEW summaries_stats IS 'إحصائيات شاملة عن الملخصات';

-- View موحد للإحصائيات العامة
CREATE OR REPLACE VIEW system_stats AS
SELECT 
    (SELECT COUNT(*) FROM files) as total_files,
    (SELECT COALESCE(SUM(file_size), 0) FROM files) as total_storage,
    (SELECT COUNT(*) FROM quizzes) as total_quizzes,
    (SELECT COUNT(*) FROM file_summaries) as total_summaries,
    (SELECT MAX(created_at) FROM files) as last_file_upload,
    (SELECT MAX(created_at) FROM quizzes) as last_quiz_created,
    (SELECT MAX(created_at) FROM file_summaries) as last_summary_created;

COMMENT ON VIEW system_stats IS 'إحصائيات شاملة للنظام بالكامل';

-- ═══════════════════════════════════════════════════════
-- 5️⃣ دوال مساعدة (Helper Functions)
-- ═══════════════════════════════════════════════════════

-- دالة للبحث في الاختبارات
CREATE OR REPLACE FUNCTION search_quizzes(search_query TEXT)
RETURNS TABLE (
    id BIGINT,
    quiz_name TEXT,
    source_file_name TEXT,
    question_count INTEGER,
    total_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        q.id,
        q.quiz_name,
        q.source_file_name,
        q.question_count,
        q.total_score,
        q.created_at
    FROM quizzes q
    WHERE 
        q.quiz_name ILIKE '%' || search_query || '%' OR
        q.source_file_name ILIKE '%' || search_query || '%'
    ORDER BY q.created_at DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_quizzes IS 'دالة للبحث في الاختبارات حسب الاسم أو الملف المصدر';

-- دالة للبحث في الملخصات
CREATE OR REPLACE FUNCTION search_summaries(search_query TEXT)
RETURNS TABLE (
    id BIGINT,
    file_id BIGINT,
    summary_name TEXT,
    word_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fs.id,
        fs.file_id,
        fs.summary_name,
        fs.word_count,
        fs.created_at
    FROM file_summaries fs
    WHERE 
        fs.summary_name ILIKE '%' || search_query || '%'
    ORDER BY fs.created_at DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_summaries IS 'دالة للبحث في الملخصات حسب الاسم';

-- دالة لحذف اختبار مع التنظيف
CREATE OR REPLACE FUNCTION delete_quiz_cascade(quiz_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM quizzes WHERE id = quiz_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count > 0;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION delete_quiz_cascade IS 'دالة لحذف اختبار بشكل آمن';

-- ═══════════════════════════════════════════════════════
-- 6️⃣ إعادة تحميل ذاكرة التخزين المؤقت
-- ═══════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════
-- 7️⃣ التحقق من النجاح
-- ═══════════════════════════════════════════════════════

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE '✅ تم تحديث قاعدة البيانات بنجاح!';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '✓ تم إنشاء جدول quizzes';
    RAISE NOTICE '✓ تم تحديث جدول file_summaries';
    RAISE NOTICE '✓ تم إنشاء الفهارس';
    RAISE NOTICE '✓ تم إنشاء Views الإحصائيات';
    RAISE NOTICE '✓ تم إنشاء الدوال المساعدة';
    RAISE NOTICE '✓ تم تحديث سياسات RLS';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 النظام جاهز لإنشاء وإدارة الاختبارات والملخصات!';
    RAISE NOTICE '';
    RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

-- التحقق النهائي
SELECT 
    '✅ جدول quizzes' as check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_name = 'quizzes'
        ) THEN 'موجود ✓'
        ELSE 'غير موجود ✗'
    END as status
UNION ALL
SELECT 
    '✅ أعمدة file_summaries الجديدة' as check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'file_summaries' 
            AND column_name = 'summary_name'
        ) THEN 'موجودة ✓'
        ELSE 'غير موجودة ✗'
    END as status
UNION ALL
SELECT 
    '✅ View quizzes_stats' as check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.views 
            WHERE table_name = 'quizzes_stats'
        ) THEN 'موجود ✓'
        ELSE 'غير موجود ✗'
    END as status
UNION ALL
SELECT 
    '✅ View summaries_stats' as check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.views 
            WHERE table_name = 'summaries_stats'
        ) THEN 'موجود ✓'
        ELSE 'غير موجود ✗'
    END as status
UNION ALL
SELECT 
    '✅ دالة search_quizzes' as check_item,
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM pg_proc 
            WHERE proname = 'search_quizzes'
        ) THEN 'موجودة ✓'
        ELSE 'غير موجودة ✗'
    END as status;
