Web SDK API V2 参考 MySQL 数据库查询数据
查询数据
对表执行 SELECT 查询。

您可以使用 range() 查询来分页浏览数据。

select() 可以与 过滤器 结合使用

select() 也可以与 修饰符 结合使用

参数
参数 类型 必需 说明
columns Query 可选 要检索的列，用逗号分隔。返回时可以使用 customName:aliasName 重命名列
options object 可选 查询选项配置
options 详细配置
参数 类型 必需 说明
count string 可选 计数算法，可选值：
"exact" - 底层执行 COUNT(\*)
head boolean 可选 设置为 true 时不返回数据，仅在需要计数时有用
代码示例
const app = cloudbase.init({
...
});

const db = app.mysql();

基础查询
获取数据
// 查询 articles 表中的所有数据
const { data, error } = await db.from("articles").select();

选择特定列
// 只查询文章的标题和创建时间
const { data, error } = await db.from("articles").select("title, created_at");

关联表查询
查询关联表
// 查询文章数据，同时获取关联的分类信息
const { data, error } = await db.from("articles").select(`    title,
    categories (
      name
    )
 `);

查询表名包含空格的关联表
// 如果表名中有空格，需要用双引号包裹
const { data, error } = await db.from("blog posts").select(`    title,
    "article categories" (
      name
    )
 `);

通过连接表查询关联表
// 查询文章及其作者信息
const { data, error } = await db.from("articles").select(`    title,
    users (
      name
    )
 `);

多次查询同一个关联表
// 查询文章，同时获取创建者和修改者的信息
// 使用外键约束名来区分不同的关联关系
const { data, error } = await db.from("articles").select(`    title,
    created_by:users!articles_created_by_fkey(name),
    updated_by:users!articles_updated_by_fkey(name)
 `);

说明：当同一个表（这里是 users）通过不同的外键关联多次时，需要使用外键约束名（articles_created_by_fkey 和 articles_updated_by_fkey）来区分不同的关联关系。这通常发生在一张表有多个字段都关联到同一张目标表的情况。

通过连接表查询嵌套的外键表
// 查询分类及其下的所有文章，以及文章的作者信息
const { data, error } = await db.from("categories").select(`    name,
    articles (
      title,
      users (
        name
      )
    )
 `);

高级查询
通过关联表过滤
// 查询特定分类下的所有文章
const { data, error } = await db
.from("articles")
.select("title, categories(\*)")
.eq("categories.name", "技术文章");

说明：通过在 .eq() 中使用关联表的字段（categories.name），可以基于关联数据的条件来过滤主表数据。这种查询会自动处理表之间的关联关系。

查询关联表并计数
// 获取每个分类及其包含的文章数量
const { data, error } = await db
.from("categories")
.select(`*, articles(count)`);

说明：articles(count) 会返回每个分类下文章的数量，而不会加载具体的文章数据。这在需要统计关联数据数量但不需要详细数据时非常有用，可以提高查询性能。

使用计数选项查询
// 只获取文章总数，不返回具体数据
const { count, error } = await db
.from("articles")
.select("\*", { count: "exact", head: true });

使用内连接查询关联表
// 只获取有分类的文章，使用内连接确保分类存在
const { data, error } = await db
.from("articles")
.select("title, categories!inner(name)")
.eq("categories.name", "教程")
.limit(10);

说明：!inner 表示内连接，只返回那些在关联表中存在匹配记录的数据。在这个例子中，只返回有对应分类的文章，排除了没有分类的文章。这在需要确保关联数据完整性时非常有用。

新增数据
对表执行 INSERT 操作。

默认情况下，插入的行不会被返回。要返回插入的数据，请使用 .select() 链式调用。

注意：仅当表中只有一个主键，且该主键为自增类型时，.select() 方法才会返回插入的行。

参数
参数 类型 必需 说明
values object | Array 必需 要插入的值。传递对象以插入单行，或传递数组以插入多行。
options object 可选 插入选项配置
options 详细配置
参数 类型 必需 说明
count string 可选 计数算法，可选值：
"exact" - 底层执行 COUNT(\*)
代码示例
const app = cloudbase.init({
...
});

const db = app.mysql();

基础插入
创建记录
// 向 articles 表中插入一条记录
const { error } = await db
.from("articles")
.insert({ title: "新文章标题", content: "文章内容" });

创建记录并返回数据
// 插入记录并返回插入的数据
const { data, error } = await db
.from("articles")
.insert({ title: "新文章标题", content: "文章内容" })
.select();

批量插入
批量创建记录
// 一次性插入多条记录
const { error } = await db.from("articles").insert([
{ title: "第一篇文章", content: "第一篇文章内容" },
{ title: "第二篇文章", content: "第二篇文章内容" },
]);

更新数据
对表执行 UPDATE 操作。

update() 应该始终与过滤器结合使用，以定位您希望更新的行。

参数
参数 类型 必需 说明
values Row 必需 要更新的值
options object 可选 命名参数
options 详细配置
参数 类型 必需 说明
count string 可选 计数算法，用于计算更新的行数：
"exact" - 底层执行 COUNT(\*)
代码示例
const app = cloudbase.init({
...
});

const db = app.mysql();

基础更新
更新数据
// 更新 articles 表中 id 为 1 的记录，将 title 字段改为"新标题"
const { error } = await db
.from("articles")
.update({ title: "新标题" })
.eq("id", 1);

更新或创建数据
对表执行 UPSERT 操作。根据传递给冲突列的配置，.upsert() 允许您执行等效于 .insert() 的操作（如果不存在具有相应唯一约束的行），或者如果确实存在，则根据配置执行更新操作。

主键必须包含在值中才能使用 upsert。

参数
参数 类型 必需 说明
values Row/Array<Row> 必需 要 upsert 的值。传递对象以 upsert 单行，或传递数组以 upsert 多行
options object 可选 命名参数
options 详细配置
参数 类型 必需 说明
count string 可选 用于计算 upserted 行数的计数算法。
"exact" - 底层执行 COUNT(\*)
ignoreDuplicates boolean 可选 如果为 true，则忽略重复行。如果为 false，则重复行与现有行合并
onConflict string 可选 逗号分隔的唯一索引列，用于指定如何确定重复行。当所有指定的列都相等时，两行被视为重复。在 MySQL 中，这通常对应于唯一索引或主键
代码示例
const app = cloudbase.init({
...
});

const db = app.mysql();

基础 upsert
Upsert 数据
// 如果 articles 表中存在 id 为 1 的记录则更新 title 为"MySQL 教程"，不存在则插入新记录
const { data, error } = await db
.from("articles")
.upsert({ id: 1, title: "MySQL 教程" });

批量 Upsert 数据
// 根据 title 字段判断冲突，如果存在 title 为"唯一标题"的记录则更新，否则插入 id 为 42 的新记录
const { data, error } = await db
.from("articles")
.upsert(
{ id: 42, title: "唯一标题", content: "文章内容" },
{ onConflict: "title" }
);

说明：使用 upsert() 时必须包含主键列，这样才能正确判断是插入新行还是更新现有行。在 MySQL 中，upsert 通常通过 ON DUPLICATE KEY UPDATE 语法实现，当插入的数据与现有主键或唯一索引冲突时，会执行更新操作。onConflict 参数用于指定冲突判断的列，对应 MySQL 中的唯一索引列。

删除数据
对表执行 DELETE 操作。

delete() 应始终与过滤器结合使用，以定位您希望删除的行。

当使用 delete().in() 时，指定一个值数组以使用单个查询定位多行。这对于批量删除具有共同条件的条目特别有用，例如按其 ID 删除用户。确保您提供的数组准确表示您打算删除的所有记录，以避免意外删除数据。

参数
参数 类型 必需 说明
options object 必需 命名参数
options 详细配置
参数 类型 必需 说明
count string 可选 计数算法，可选值：
"exact" - 底层执行 COUNT(\*)
代码示例
const app = cloudbase.init({
...
});

const db = app.mysql();

删除单个记录
// 删除 articles 表中 id 为 1 的记录
const response = await db.from("articles").delete().eq("id", 1);

删除多个记录
// 批量删除 articles 表中 id 为 1、2、3 的多条记录
const response = await db.from("articles").delete().in("id", [1, 2, 3]);

过滤器
过滤器允许您只返回符合特定条件的行。

过滤器可以用于 select()、update()、upsert() 和 delete() 查询。

eq
仅匹配列值等于指定值的行。

要检查列值是否为 NULL，应该使用 .is() 而不是 eq。

参数
参数 类型 必需 说明
column string 必需 要过滤的列
value any 必需 用于过滤的值
代码示例
// 从 `articles` 表中查询所有 `title` 等于 "腾讯云开发" 的记录
const { data, error } = await db
.from("articles")
.select()
.eq("title", "腾讯云开发");

neq
仅匹配列值不等于指定值的行。

参数
参数 类型 必需 说明
column string 必需 要过滤的列
value any 必需 用于过滤的值
代码示例
// 从 `articles` 表中查询所有 `title` 不等于 "腾讯云开发" 的记录
const { data, error } = await db
.from("articles")
.select()
.neq("title", "腾讯云开发");

gt
仅匹配列值大于指定值的行。

参数
参数 类型 必需 说明
column string 必需 要过滤的列
value any 必需 用于过滤的值
代码示例
// 从 `articles` 表中查询所有 `id` 大于 2 的记录
const { data, error } = await db.from("articles").select().gt("id", 2);

gte
仅匹配列值大于或等于指定值的行。

参数
参数 类型 必需 说明
column string 必需 要过滤的列
value any 必需 用于过滤的值
代码示例
// 从 `articles` 表中查询所有 `id` 大于或等于 2 的记录
const { data, error } = await db.from("articles").select().gte("id", 2);

lt
仅匹配列值小于指定值的行。

参数
参数 类型 必需 说明
column string 必需 要过滤的列
value any 必需 用于过滤的值
代码示例
// 从 `articles` 表中查询所有 `id` 小于 2 的记录
const { data, error } = await db.from("articles").select().lt("id", 2);

lte
仅匹配列值小于或等于指定值的行。

参数
参数 类型 必需 说明
column string 必需 要过滤的列
value any 必需 用于过滤的值
代码示例
// 从 `articles` 表中查询所有 `id` 小于或等于 2 的记录
const { data, error } = await db.from("articles").select().lte("id", 2);

like
仅匹配列值符合特定模式的行（是否区分大小写受校验规则约束）。

参数
参数 类型 必需 说明
column string 必需 要过滤的列
pattern string 必需 要匹配的模式
代码示例
// 从 `articles` 表中查询所有 `title` 包含 "cloudbase" 的记录
const { data, error } = await db
.from("articles")
.select()
.like("title", "%cloudbase%");

is
仅匹配列值等于指定值的行。

对于非布尔列，主要用于检查列值是否为 NULL；

对于布尔列，也可以设置为 true 或 false，行为与 .eq() 相同。

参数
参数 类型 必需 说明
column string 必需 要过滤的列
value Object 必需 用于过滤的值
代码示例
// 从 `articles` 表中查询所有 `title` 为 null 的记录
const { data, error } = await db.from("articles").select().is("title", null);

in
仅匹配列值包含在指定数组中的行。

参数
参数 类型 必需 说明
column string 必需 要过滤的列
values Array 必需 用于过滤的值数组
代码示例
// 从 `articles` 表中查询所有 `title` 在指定数组 ["腾讯云开发", "云开发"] 中的记录
const { data, error } = await db
.from("articles")
.select()
.in("title", ["腾讯云开发", "云开发"]);

match
仅匹配查询键中每个列都等于其关联值的行。相当于多个 .eq() 的简写形式。

参数
参数 类型 必需 说明
query Record<ColumnName, Row['ColumnName']> 必需 过滤对象，列名作为键映射到它们的过滤值
代码示例
// 从 `articles` 表中查询所有 `id` 等于 2 且 `title` 等于 "腾讯云开发" 的记录
const { data, error } = await db
.from("articles")
.select()
.match({ id: 2, title: "腾讯云开发" });

not
仅匹配不满足过滤条件的行。

与大多数过滤器不同，操作符和值按原样使用，需要遵循 MySQL 语法。还需要确保它们已正确转义。

not() 期望你使用原始的 MySQL 语法作为过滤器值。

.not('id', 'in', '(5,6,7)') // 对 `in` 过滤器使用 `()`
.not('name', 'like', '%test%') // 使用 `not like` 进行模糊匹配

参数
参数 类型 必需 说明
column string 必需 要过滤的列
operator string 必需 要取反的过滤操作符，遵循 MySQL 语法
value any 必需 过滤值，遵循 MySQL 语法
代码示例
// 从 `articles` 表中查询所有 `title` 不为 null 的记录
const { data, error } = await db
.from("articles")
.select()
.not("title", "is", null);

or
仅匹配满足至少一个过滤条件的行。

与大多数过滤器不同，过滤器按原样使用，需要遵循 MySQL 语法。还需要确保它们已正确转义。

目前无法跨多个表进行 .or() 过滤。

or() 期望你使用原始的 MySQL 语法作为过滤器名称和值。

.or('id.in.(5,6,7), name.like.%test%') // 对 `in` 过滤器使用 `()`，对模糊匹配使用 `like` 和 `%`
.or('id.in.(5,6,7), name.not.like.%test%') // 使用 `not.like` 进行反向模糊匹配

参数
参数 类型 必需 说明
filters string 必需 要使用的过滤器，遵循 MySQL 语法
options object 必需 命名参数
options.referencedTable string 可选 设置为过滤引用表而不是父表
代码示例
// 从 `articles` 表中查询所有 `id` 等于 2 或者 `title` 等于 "腾讯云开发" 的记录
const { data, error } = await db
.from("articles")
.select()
.or(`id.eq.2,title.eq.腾讯云开发`);

filter
仅匹配满足过滤条件的行。这是一个逃生舱口 - 你应该尽可能使用特定的过滤器方法。

与大多数过滤器不同，操作符和值按原样使用，需要遵循 MySQL 语法。还需要确保它们已正确转义。

filter() 期望你使用原始的 MySQL 语法作为过滤器值。

.filter('id', 'in', '(5,6,7)') // 对 `in` 过滤器使用 `()`
.filter('name', 'like', '%test%') // 使用 `like` 进行模糊匹配
.filter('name', 'not.like', '%test%') // 使用 `not.like` 进行反向模糊匹配

参数
参数 类型 必需 说明
column string 必需 要过滤的列
operator string 必需 过滤操作符，遵循 MySQL 语法
value any 必需 过滤值，遵循 MySQL 语法
代码示例
// 查询 title 在指定值列表中的记录
// 从 `articles` 表中查询所有 `title` 在指定值列表 ["腾讯云开发", "云开发"] 中的记录
const { data, error } = await db
.from("articles")
.select()
.filter("title", "in", "(腾讯云开发,云开发)");

// 在引用表上过滤
// 从 `articles` 表中查询所有关联的 `categories.name` 等于 "技术" 的记录
const { data, error } = await db
.from("articles")
.select()
.filter("categories.name", "eq", "技术");

修饰符
修饰符用于改变响应的格式，与过滤器不同，它们作用于行级别以上的操作。

过滤器仅返回匹配特定条件的行而不改变行的形状，而修饰符允许你改变响应的格式（例如返回 CSV 字符串）。

select
默认情况下，.insert() 不会返回插入的行。通过调用此方法，插入的行将在数据中返回。

注意：仅当表中只有一个主键，且该主键为自增类型时，.select() 方法才会返回插入的行。

参数
参数名 类型 必填 描述
columns string 否 要检索的列，用逗号分隔
代码示例
// 在 `articles` 表中执行 upsert 操作，并返回修改后的完整记录
const { data, error } = await db
.from("articles")
.insert({ id: 1, title: "腾讯云开发新功能" })
.select();

order
对查询结果进行排序。

您可以多次调用此方法来按多个列排序。

您可以对引用的表进行排序，但仅当您在查询中使用 !inner 时，它才会影响父表的排序。

参数
参数名 类型 必填 描述
column string 是 要排序的列
options object 否 命名参数
options 参数详情
参数名 类型 必填 描述
ascending boolean 否 如果为 true，结果将按升序排列
nullsFirst boolean 否 如果为 true，null 值将首先出现。如果为 false，null 值将最后出现
referencedTable string 否 设置为按引用表的列排序
代码示例
// 按发布时间降序排列文章
const { data, error } = await db
.from("articles")
.select("id, title, published_at")
.order("published_at", { ascending: false });

对引用表排序
// 对引用表 categories 按 name 降序排列
const { data, error } = await db
.from("articles")
.select(
`      title,
      categories (
        name
      )
   `
)
.order("name", { referencedTable: "categories", ascending: false });

// 按引用表 category 的 name 列升序排列
const { data, error } = await db
.from("articles")
.select(
`      title,
      category:categories (
        name
      )
   `
)
.order("category(name)", { ascending: true });

limit
限制返回的行数。

参数
参数名 类型 必填 描述
count number 是 要返回的最大行数
options object 否 命名参数
options 参数详情
参数名 类型 必填 描述
referencedTable string 否 设置为限制引用表的行数，而不是父表的行数
代码示例
// 限制返回 5 篇文章
const { data, error } = await db.from("articles").select("title").limit(5);

限制引用表的行数
// 每篇文章只返回 3 个分类
const { data, error } = await db
.from("articles")
.select(
`    title,
    categories (
      name
    )
 `
)
.limit(3, { referencedTable: "categories" });

range
限制查询结果的范围。

通过从偏移量 from 开始到 to 结束来限制查询结果，只有在此范围内的记录会被返回。

这遵循查询顺序，如果没有排序子句，范围行为可能会不可预期。

from 和 to 值是基于 0 的且包含边界：range(1, 3) 将包括查询的第二、第三和第四行。

参数
参数名 类型 必填 描述
from number 是 限制结果的起始索引
to number 是 限制结果的结束索引
options object 是 命名参数
options 参数详情
参数名 类型 必填 描述
referencedTable string 否 设置为限制引用表的行数，而不是父表的行数
代码示例
// 获取文章列表的第 1-2 条记录（包含边界）
const { data, error } = await db.from("articles").select("title").range(0, 1);

对引用表使用范围限制
// 每篇文章只返回前 2 个分类（索引 0-1）
const { data, error } = await db
.from("articles")
.select(
`    title,
    categories (
      name
    )
 `
)
.range(0, 1, { referencedTable: "categories" });

abortSignal
此方法仅在 Web 环境下可用。

为 fetch 请求设置 AbortSignal。

您可以使用此功能为请求设置超时。

参数
参数名 类型 必填 描述
signal AbortSignal 是 用于 fetch 请求的 AbortSignal
代码示例
// 使用 AbortController 手动中止请求
const ac = new AbortController();
ac.abort();
const { data, error } = await db
.from("articles")
.select()
.abortSignal(ac.signal);

// 使用 AbortSignal.timeout 设置 1 秒超时
const { data, error } = await db
.from("articles")
.select()
.abortSignal(AbortSignal.timeout(1000 /_ ms _/));

single
检索单行数据。

将数据作为单个对象返回，而不是对象数组。

查询结果必须只有一行（例如使用 .limit(1)），否则此方法会返回错误。

代码示例
// 获取第一篇文章的标题
const { data, error } = await db
.from("articles")
.select("title")
.limit(1)
.single();

maybeSingle
检索零行或一行数据。

将数据作为单个对象返回，而不是对象数组。

查询结果必须为零行或一行（例如使用 .limit(1)），否则此方法会返回错误。

代码示例
// 根据标题查找文章，可能不存在
const { data, error } = await db
.from("articles")
.select()
.eq("title", "腾讯云开发新功能")
.maybeSingle();

overrideTypes
部分覆盖或替换成功响应的类型。

覆盖响应中 data 字段的返回类型。这对于类型安全的查询结果转换非常有用。

参数
参数名 类型 必填 描述
type T 是 要覆盖的类型
options object 否 选项对象
options 参数详情
参数名 类型 必填 描述
merge boolean 否 如果为 false，则完全替换类型而不是合并
代码示例
完全覆盖数组类型
// 将响应数据完全覆盖为自定义数组类型，merge: false 表示完全替换而非合并
const { data } = await db
.from("articles")
.select()
.overrideTypes<Array<MyType>, { merge: false }>();

完全覆盖对象类型
// 与 maybeSingle 一起使用，将单个对象响应完全覆盖为自定义类型
const { data } = await db
.from("articles")
.select()
.maybeSingle()
.overrideTypes<MyType, { merge: false }>();

部分覆盖数组类型
// 部分覆盖数组元素类型，只指定需要改变的字段类型（如 status 字段）
const { data } = await db
.from("articles")
.select()
.overrideTypes<Array<{ status: "A" | "B" }>>();

部分覆盖对象类型
// 部分覆盖单个对象类型，只指定需要改变的字段类型（如 status 字段）
const { data } = await db
.from("articles")
.select()
.maybeSingle()
.overrideTypes<{ status: "A" | "B" }>();

上一页
过滤器
下一页
