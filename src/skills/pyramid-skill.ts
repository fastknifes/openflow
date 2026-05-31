import type { SkillInfo } from './types.js'

export function getPyramidSkill(): SkillInfo {
  return {
    name: 'pyramid-principle-programming',
    description:
      '使用金字塔原理进行结构化编程，确保抽象一致和分层清晰。在编写复杂业务逻辑、设计模块结构或进行代码重构时调用。',
    content: `# 金字塔原理编程 Skill

## 1. Skill 名称

金字塔原理编程

## 2. Skill 目标

使用《金字塔原理》的结构化思维指导 AI 编程，让 AI 在写代码、重构代码、设计模块、拆分任务、审查代码时，始终保持：

1. 结论先行
2. 层级清晰
3. 抽象一致
4. 分类合理
5. 职责明确
6. 代码从高层意图逐层下沉到低层实现

本 Skill 的核心目标不是让 AI 写出更多代码，而是让 AI 写出更容易理解、维护、扩展和审查的代码。

核心口号：

> 先建金字塔，再写代码；先定抽象层，再填实现细节。

---

## 3. 适用场景

当用户提出以下需求时，AI 应该主动使用本 Skill：

1. 编写复杂业务功能
2. 拆分产品需求
3. 设计模块结构
4. 重构已有代码
5. 处理大量 if/else 分支
6. 处理重复代码
7. 设计领域模型
8. 审查代码结构
9. 修复代码与文档漂移
10. 将混乱需求整理成可执行开发任务

不适用场景：

1. 极小的代码片段修复
2. 单行命令生成
3. 简单语法解释
4. 与架构、抽象、分层无关的纯工具问题

如果任务很简单，可以简化执行，但仍应遵守“抽象层级一致”的原则。

---

## 4. 核心思想

### 4.1 结论先行

在开始编码前，先给出本次实现的最高层结论。

AI 在写代码前必须先说明：

\`\`\`text
我要解决什么问题？
最终会形成什么结构？
核心抽象是什么？
主要模块如何分层？
\`\`\`

错误方式：

\`\`\`text
先创建 userService，然后写几个 if 判断，再处理数据库，再处理返回值。
\`\`\`

正确方式：

\`\`\`text
本次实现的核心是“用户注册流程”。
它可以拆成三层：
1. 应用流程层：registerUser
2. 领域规则层：validateUser、createUser、assignDefaultRole
3. 基础设施层：saveUser、sendWelcomeEmail
\`\`\`

---

### 4.2 自上而下表达，自下而上归纳

写代码时，先从高层意图开始，再逐层展开细节。

高层函数应该像目录、流程图或业务说明书。

示例：

\`\`\`javascript
async function registerUser(command) {
  validateRegisterCommand(command);
  const user = createUser(command);
  await persistUser(user);
  await notifyUserRegistered(user);
  return user;
}
\`\`\`

这个函数不应该直接包含：

\`\`\`javascript
if (!email.includes("@")) ...
db.insert(...)
smtp.send(...)
JSON.stringify(...)
\`\`\`

这些都属于更低层的实现细节，应该下沉到低层函数中。

---

### 4.3 每一层只处理本层抽象

同一个函数、类、模块内部，应该保持同一抽象层级。

高层函数负责“编排意图”。

中层函数负责“业务规则”。

低层函数负责“技术细节”。

示例：

\`\`\`javascript
function checkout(order) {
  ensureOrderCanBePaid(order);
  applyRequiredDeductions(order);
  const paymentResult = payOrder(order);
  completeOrder(order, paymentResult);
}
\`\`\`

这个函数保持在“结算流程”层级。

不要写成：

\`\`\`javascript
function checkout(order) {
  if (order.items.some(item => item.profitRate > 0.5)) {
    const coupon = db.query("select * from coupons where user_id = ?", order.userId);
    if (!coupon || coupon.amount <= 0) {
      throw new Error("抵扣券不足");
    }
    order.amount = order.amount - coupon.amount;
  }

  const paymentResult = http.post("/pay", order);

  if (paymentResult.status === "success") {
    db.insert("orders", order);
    db.update("coupons", ...);
  }
}
\`\`\`

这个函数同时混入了：

1. 业务判断
2. 数据库查询
3. 支付调用
4. 抵扣券计算
5. 订单落库

这是抽象层级混乱。

---

### 4.4 当前函数只能调用比自己低一层的函数

一个函数不应该越级调用过于底层的细节。

推荐规则：

\`\`\`text
高层函数 → 调用中层函数
中层函数 → 调用低层函数
低层函数 → 调用技术实现
\`\`\`

不推荐：

\`\`\`text
高层业务函数 → 直接拼 SQL
高层业务函数 → 直接操作 HTTP 细节
高层业务函数 → 直接处理 JSON 字段转换
\`\`\`

示例：

\`\`\`javascript
async function confirmOrder(command) {
  const order = buildOrder(command);
  ensureHighProfitGoodsUseDeductionCoupon(order);
  await payOrder(order);
  await grantOrderRewards(order);
  return order;
}
\`\`\`

\`confirmOrder\` 只表达“确认订单”的业务流程。

具体的抵扣券规则、支付细节、奖励发放逻辑继续下沉。

---

### 4.5 分组归类，形成代码金字塔

当代码中出现大量平铺逻辑时，AI 必须停下来进行归类。

例如购物清单：

\`\`\`text
牛奶、鸡蛋、咸鸭蛋、酸奶、葡萄、橘子、苹果、土豆、胡萝卜
\`\`\`

不应该直接平铺成 9 个动作：

\`\`\`javascript
function shopping() {
  buyMilk();
  buyEgg();
  buyDuckEgg();
  buyYogurt();
  buyGrape();
  buyOrange();
  buyApple();
  buyPotato();
  buyCarrot();
}
\`\`\`

应该归类成：

\`\`\`javascript
function shopping() {
  buyDairyAndEggs();
  buyFruits();
  buyVegetables();
}

function buyDairyAndEggs() {
  buyMilk();
  buyEgg();
  buyDuckEgg();
  buyYogurt();
}

function buyFruits() {
  buyGrape();
  buyOrange();
  buyApple();
}

function buyVegetables() {
  buyPotato();
  buyCarrot();
}
\`\`\`

这就是代码中的金字塔结构：

\`\`\`text
购物
├── 购买蛋奶类
│   ├── 牛奶
│   ├── 鸡蛋
│   ├── 咸鸭蛋
│   └── 酸奶
├── 购买水果类
│   ├── 葡萄
│   ├── 橘子
│   └── 苹果
└── 购买蔬菜类
    ├── 土豆
    └── 胡萝卜
\`\`\`

---

## 5. 金字塔结构可视化

### 5.1 AI 执行总流程图

\`\`\`mermaid
flowchart TD
    A[接收需求] --> B[识别最高层目标]
    B --> C[构建任务金字塔]
    C --> D[识别核心抽象]
    D --> E[按层分组]
    E --> F{分组是否合理?}

    F -- 否 --> C
    F -- 是 --> G[设计分层结构]

    G --> H[先写高层流程代码]
    H --> I[再写中层业务规则]
    I --> J[最后写底层技术实现]

    J --> K[执行抽象层级审查]
    K --> L{是否存在层级混乱/重复分支/过度抽象?}

    L -- 是 --> M[重构代码结构]
    M --> H

    L -- 否 --> N[输出最终代码与审查结论]
\`\`\`

这张图强调：

1. 不是先写代码，而是先识别目标
2. 先搭金字塔，再落代码
3. 代码完成后必须做结构审查
4. 如果结构有问题，要回到上层重新整理，而不是继续堆细节

---

### 5.2 代码金字塔分层图

\`\`\`mermaid
flowchart TB
    A[业务目标层]
    B[业务流程层]
    C[业务规则层]
    D[领域对象层]
    E[基础设施层]

    A --> B
    B --> C
    C --> D
    D --> E
\`\`\`

分层含义：

1. 业务目标层：回答“要完成什么事”
2. 业务流程层：回答“分几步完成”
3. 业务规则层：回答“每一步遵循什么规则”
4. 领域对象层：回答“业务对象本身有什么行为”
5. 基础设施层：回答“数据库、HTTP、缓存、MQ 等如何实现”

---

### 5.3 函数抽象层级图

\`\`\`mermaid
flowchart TD
    A[confirmOrder]
    A --> B[buildOrder]
    A --> C[applyRequiredDeductionCoupon]
    A --> D[payOrder]
    A --> E[completeOrder]
    A --> F[grantRewards]

    C --> C1[detectHighProfitGoods]
    C --> C2[loadAvailableCoupon]
    C --> C3[validateCoupon]
    C --> C4[deductCoupon]

    D --> D1[buildPaymentRequest]
    D --> D2[requestPaymentGateway]
    D --> D3[parsePaymentResponse]
\`\`\`

这张图说明：

1. \`confirmOrder\` 是高层流程函数
2. 它不应该直接查数据库、拼 HTTP 请求、做 JSON 转换
3. 它只负责协调下层动作
4. 细节由更低层函数处理

---

### 5.4 if/else 抽象提升判断图

\`\`\`mermaid
flowchart TD
    A[发现多个 if/else 分支] --> B{这些分支是否属于同一类业务行为?}
    B -- 否 --> C[保留分支，不强行抽象]
    B -- 是 --> D{是否可以找到统一命名?}
    D -- 否 --> C
    D -- 是 --> E{抽象后是否更易理解和扩展?}
    E -- 否 --> C
    E -- 是 --> F[提升抽象层次]
    F --> G[提取统一接口/策略/多态/配置]
\`\`\`

这张图用于避免两种极端：

1. 不抽象：代码里全是分支地狱
2. 过度抽象：为了消灭 if，硬造一堆没必要的类

---

### 5.5 金字塔归类示意图

\`\`\`mermaid
flowchart TD
    A[需要带的物品]

    A --> B[蛋奶类]
    A --> C[水果类]
    A --> D[蔬菜类]

    B --> B1[牛奶]
    B --> B2[鸡蛋]
    B --> B3[咸鸭蛋]
    B --> B4[酸奶]

    C --> C1[葡萄]
    C --> C2[橘子]
    C --> C3[苹果]

    D --> D1[土豆]
    D --> D2[胡萝卜]
\`\`\`

这张图表达：

> 抽象不是简单罗列细节，而是把多个具体项提升到更高一层的分组概念上。

---

### 5.6 AI 编码约束图

\`\`\`mermaid
flowchart TD
    A[开始编码] --> B{是否已经识别最高层目标?}
    B -- 否 --> B1[先总结任务目标]
    B1 --> B
    B -- 是 --> C{是否已经构建任务金字塔?}
    C -- 否 --> C1[先拆分层级结构]
    C1 --> C
    C -- 是 --> D{是否先写高层流程?}
    D -- 否 --> D1[先写高层编排函数]
    D1 --> D
    D -- 是 --> E[补充中层规则]
    E --> F[补充底层实现]
    F --> G{是否做抽象层级审查?}
    G -- 否 --> G1[执行审查]
    G1 --> G
    G -- 是 --> H[输出最终结果]
\`\`\`

---

## 6. 抽象提升规则

### 6.1 重复代码通常意味着抽象缺失

当 AI 发现以下情况时，应该考虑抽象：

1. 多处代码结构相似
2. 多个 if 分支做的是同一类事情
3. 多个类拥有相似行为
4. 多个流程只有局部差异
5. 多个字段、函数、模块可以被更高层概念统一

错误示例：

\`\`\`javascript
function check(fruit) {
  if (fruit instanceof Apple) {
    return fruit.isSweet();
  }

  if (fruit instanceof Watermelon) {
    return fruit.isJuicy();
  }

  throw new Error("未知水果");
}
\`\`\`

这里的问题不是 if 本身，而是 \`isSweet\` 和 \`isJuicy\` 在当前业务语境下都表达“这个水果好不好吃”。

应该提升抽象：

\`\`\`javascript
class Fruit {
  isTasty() {
    throw new Error("子类必须实现 isTasty");
  }
}

class Apple extends Fruit {
  isTasty() {
    return this.sweetDegree > 60;
  }
}

class Watermelon extends Fruit {
  isTasty() {
    return this.waterDegree > 60;
  }
}

function check(fruit) {
  return fruit.isTasty();
}
\`\`\`

抽象提升后，调用方不再关心水果种类，只关心统一语义：

\`\`\`text
这个水果是否好吃？
\`\`\`

---

### 6.2 多条件分支是抽象检查信号

当出现以下结构时，AI 必须主动检查是否需要抽象提升：

\`\`\`javascript
if (type === "A") {
  doA();
} else if (type === "B") {
  doB();
} else if (type === "C") {
  doC();
}
\`\`\`

AI 必须自问：

\`\`\`text
这些分支是否属于同一个上层概念？
这些行为是否可以被统一命名？
是否应该使用策略模式、多态、配置表、规则引擎或映射表？
\`\`\`

但不要机械消灭所有 if。

允许保留 if 的情况：

1. 分支数量很少
2. 分支不会持续扩展
3. 分支表达的是简单业务判断
4. 抽象后反而增加理解成本
5. 当前没有稳定的共同语义

---

### 6.3 不要为了抽象而抽象

抽象必须服务于理解、复用和变化隔离。

禁止以下坏抽象：

\`\`\`text
BaseManager
CommonProcessor
UniversalHandler
AbstractService
GeneralUtil
\`\`\`

如果一个抽象的名字过于宽泛，通常说明抽象层次太高，已经失去业务含义。

坏抽象：

\`\`\`javascript
function process(data) {}
function handle(item) {}
function execute(context) {}
\`\`\`

好抽象：

\`\`\`javascript
function applyDeductionCoupon(order) {}
function calculateOrderReward(order) {}
function validateTransferAmount(command) {}
function createCouponSourceRecord(coupon) {}
\`\`\`

抽象不是把名字变得更虚，而是把概念变得更准。

---

## 7. 代码金字塔结构

AI 在设计代码时，应该优先形成如下结构：

\`\`\`text
业务目标层
└── 业务流程层
    └── 业务规则层
        └── 领域对象层
            └── 基础设施层
\`\`\`

### 7.1 业务目标层

回答：

\`\`\`text
系统要完成什么业务目标？
\`\`\`

示例：

\`\`\`text
完成订单确认
完成抵扣券赠送
查询抵扣券来源记录
配置高让利阈值
\`\`\`

---

### 7.2 业务流程层

回答：

\`\`\`text
为了完成目标，需要哪些步骤？
\`\`\`

示例：

\`\`\`javascript
async function confirmOrder(command) {
  const order = await createPendingOrder(command);
  await enforceDeductionCouponIfRequired(order);
  await payOrder(order);
  await completeOrder(order);
  await grantRewards(order);
  return order;
}
\`\`\`

---

### 7.3 业务规则层

回答：

\`\`\`text
每一步背后的业务规则是什么？
\`\`\`

示例：

\`\`\`javascript
function enforceDeductionCouponIfRequired(order) {
  if (!order.containsHighProfitGoods()) {
    return;
  }

  order.requireDeductionCoupon();
}
\`\`\`

---

### 7.4 领域对象层

回答：

\`\`\`text
业务概念本身应该具备什么行为？
\`\`\`

示例：

\`\`\`javascript
class Order {
  containsHighProfitGoods() {
    return this.items.some(item => item.isHighProfitGoods());
  }

  requireDeductionCoupon() {
    if (!this.deductionCoupon) {
      throw new Error("高让利商品必须使用抵扣券");
    }
  }
}
\`\`\`

---

### 7.5 基础设施层

回答：

\`\`\`text
如何存储、查询、调用外部服务？
\`\`\`

示例：

\`\`\`javascript
class OrderRepository {
  async save(order) {
    return db.orders.insert(order.toPersistence());
  }
}
\`\`\`

---

## 8. AI 编程流程

AI 在执行任何编码任务时，必须遵循以下流程。

### 8.1 第一步：识别最高层目标

先用一句话说明本次任务的业务目标。

格式：

\`\`\`text
本次任务的最高层目标是：____。
\`\`\`

示例：

\`\`\`text
本次任务的最高层目标是：在用户确认订单时，对高让利商品强制使用抵扣券，并在支付成功后记录抵扣券使用情况。
\`\`\`

---

### 8.2 第二步：构建任务金字塔

在写代码前，先拆出 2 到 5 个一级模块。

格式：

\`\`\`text
任务金字塔：
1. 订单确认流程
2. 高让利商品判断
3. 抵扣券强制抵扣
4. 支付成功后记录
5. 奖励发放兼容
\`\`\`

每个一级模块下面再拆二级动作。

示例：

\`\`\`text
1. 订单确认流程
   1.1 创建待支付订单
   1.2 判断商品让利类型
   1.3 应用抵扣券
   1.4 发起支付
   1.5 完成订单

2. 抵扣券强制抵扣
   2.1 查询用户可用抵扣券
   2.2 校验抵扣券余额
   2.3 计算抵扣金额
   2.4 记录抵扣券使用流水
\`\`\`

---

### 8.3 第三步：检查分组是否合理

每一组必须满足：

1. 同一组里的内容属于同一类概念
2. 同一组里的内容处于相近抽象层级
3. 上层标题可以概括下层内容
4. 同层模块之间尽量不重叠
5. 不遗漏关键业务路径

如果不满足，必须重新分组。

---

### 8.4 第四步：按金字塔生成代码

先写最高层函数。

再写中层函数。

最后写底层实现。

禁止一开始就写数据库、HTTP、字段转换、异常细节。

推荐顺序：

\`\`\`text
1. 写入口函数
2. 写流程编排函数
3. 写业务规则函数
4. 写领域对象方法
5. 写仓储、网关、外部服务适配器
6. 写异常处理和测试
\`\`\`

---

### 8.5 第五步：抽象层级审查

代码生成后，AI 必须检查：

\`\`\`text
每个函数是否只处于一个抽象层级？
高层函数是否混入了底层细节？
低层函数是否反向知道太多业务流程？
是否存在可以提升为统一接口的 if/else 分支？
是否存在过度抽象？
\`\`\`

---

## 9. AI 输出格式

当用户要求 AI 编程时，AI 应该按以下格式输出。

### 9.1 设计阶段输出

\`\`\`text
## 最高层目标

本次任务要解决：____。

## 任务金字塔

1. ____
   1.1 ____
   1.2 ____

2. ____
   2.1 ____
   2.2 ____

## 核心抽象

- 抽象 1：____
- 抽象 2：____
- 抽象 3：____

## 分层设计

- 应用层：____
- 领域层：____
- 基础设施层：____

## 风险点

- 风险 1：____
- 风险 2：____
\`\`\`

---

### 9.2 编码阶段输出

\`\`\`text
## 编码策略

我将按照以下顺序实现：

1. 先实现高层流程
2. 再实现业务规则
3. 再实现领域对象
4. 最后实现基础设施细节

## 代码
\`\`\`

---

### 9.3 审查阶段输出

\`\`\`text
## 金字塔结构审查

### 1. 抽象层级是否一致

结论：通过 / 不通过

说明：____

### 2. 分组是否合理

结论：通过 / 不通过

说明：____

### 3. 是否存在过度抽象

结论：通过 / 不通过

说明：____

### 4. 是否存在可提升抽象的 if/else

结论：通过 / 不通过

说明：____

### 5. 是否需要重构

建议：____
\`\`\`

---

## 10. 代码坏味道识别

AI 遇到以下情况时，必须触发“金字塔原理编程”检查。

### 10.1 抽象层级混乱

表现：

\`\`\`javascript
function handleOrder(order) {
  validateOrder(order);
  db.query("select * from coupons");
  calculateReward(order);
  JSON.stringify(order);
  sendHttpRequest(order);
}
\`\`\`

问题：

\`\`\`text
业务校验、数据库查询、奖励计算、JSON 转换、HTTP 调用混在同一层。
\`\`\`

---

### 10.2 平铺式代码

表现：

\`\`\`javascript
function main() {
  step1();
  step2();
  step3();
  step4();
  step5();
  step6();
  step7();
  step8();
  step9();
}
\`\`\`

问题：

\`\`\`text
步骤过多，但没有归类。
\`\`\`

应该重构为：

\`\`\`javascript
function main() {
  prepare();
  executeCoreFlow();
  finish();
}
\`\`\`

---

### 10.3 重复分支

表现：

\`\`\`javascript
if (role === "agent") {
  grantAgentCoupon();
} else if (role === "shop") {
  grantShopCoupon();
} else if (role === "platform") {
  grantPlatformCoupon();
}
\`\`\`

检查：

\`\`\`text
这些角色奖励是否可以抽象为 RewardPolicy？
\`\`\`

可能重构：

\`\`\`javascript
const policy = rewardPolicyFactory.getPolicy(role);
policy.grant(context);
\`\`\`

---

### 10.4 模糊命名

坏命名：

\`\`\`text
handleData
processInfo
doTask
commonLogic
baseHandler
\`\`\`

好命名：

\`\`\`text
calculateDeductionAmount
validateCouponTransfer
createCouponSourceRecord
grantOrderCompletionRewards
\`\`\`

命名必须体现所在抽象层级。

---

## 11. 重构规则

### 11.1 提取函数

当一个函数中出现多个抽象层级时，提取函数。

重构前：

\`\`\`javascript
function pay(order) {
  if (!order.id) throw new Error("订单不存在");

  const payload = {
    orderId: order.id,
    amount: order.amount,
  };

  return http.post("/pay", payload);
}
\`\`\`

重构后：

\`\`\`javascript
function pay(order) {
  ensureOrderPayable(order);
  return requestPayment(buildPaymentPayload(order));
}
\`\`\`

---

### 11.2 提取类

当一组函数围绕同一个业务概念变化时，提取类。

例如：

\`\`\`text
抵扣券余额校验
抵扣券扣减
抵扣券赠送
抵扣券来源记录
抵扣券使用记录
\`\`\`

可以归为：

\`\`\`javascript
class DeductionCouponService {
  validateAvailableBalance() {}
  deduct() {}
  transfer() {}
  recordSource() {}
  recordUsage() {}
}
\`\`\`

如果这些逻辑已经具有明显领域属性，也可以进一步下沉到领域模型：

\`\`\`javascript
class DeductionCouponAccount {
  canDeduct() {}
  deduct() {}
  transferTo() {}
}
\`\`\`

---

### 11.3 提取策略

当多个分支代表同一类可变规则时，提取策略。

示例：

\`\`\`javascript
class AppleTastePolicy {
  isTasty(apple) {
    return apple.sweetDegree > 60;
  }
}

class WatermelonTastePolicy {
  isTasty(watermelon) {
    return watermelon.waterDegree > 60;
  }
}
\`\`\`

---

### 11.4 提取配置

当分支只是数据差异，不是行为差异时，优先使用配置，而不是策略类。

示例：

\`\`\`javascript
const profitThresholdConfig = {
  highProfitRate: 0.5,
  deductionRatio: 1,
};
\`\`\`

不要把简单配置过度设计成复杂类体系。

---

## 12. 判断是否应该抽象

AI 在抽象前必须回答以下问题：

\`\`\`text
1. 这些代码是否具有稳定共性？
2. 这个共性是否能被准确命名？
3. 抽象后调用方是否更容易理解？
4. 抽象后是否减少重复或隔离变化？
5. 抽象是否会引入不必要的耦合？
6. 未来是否真的可能扩展？
\`\`\`

如果 1、2、3 不成立，不要抽象。

如果只是为了“看起来高级”，不要抽象。

---

## 13. 判断抽象层级是否合适

一个抽象层级合适，通常满足：

\`\`\`text
上层看到它，能理解意图。
下层实现变化，不影响上层。
同层概念之间粒度接近。
名字不空泛，也不过度具体。
\`\`\`

坏例子：

\`\`\`javascript
function processOrder(order) {}
\`\`\`

太泛。

坏例子：

\`\`\`javascript
function queryUserCouponAndCheckHighProfitGoodsAndDeductAmount(order) {}
\`\`\`

太具体。

好例子：

\`\`\`javascript
function applyRequiredDeductionCoupon(order) {}
\`\`\`

它准确表达业务意图，同时隐藏实现细节。

---

## 14. 面向 AI 的强制约束

AI 在使用本 Skill 时，必须遵守：

1. 不允许直接输出一大段平铺代码
2. 不允许高层函数混入底层技术细节
3. 不允许同一函数中混杂多个抽象层级
4. 不允许看到重复代码后只复制粘贴
5. 不允许看到多个 if/else 分支后不检查抽象可能性
6. 不允许为了消灭 if 而制造过度设计
7. 不允许使用空泛命名掩盖抽象不清
8. 不允许只关注代码能运行，而忽略结构是否清晰
9. 不允许在未构建任务金字塔前处理复杂需求
10. 不允许让底层基础设施反向污染业务层

---

## 15. 任务执行检查清单

AI 在开始写代码前检查：

\`\`\`text
[ ] 是否已经识别最高层目标？
[ ] 是否已经构建任务金字塔？
[ ] 是否已经识别核心抽象？
[ ] 是否已经区分应用层、领域层、基础设施层？
[ ] 是否知道哪些细节应该下沉？
\`\`\`

AI 在写代码时检查：

\`\`\`text
[ ] 高层函数是否只表达业务流程？
[ ] 中层函数是否只表达业务规则？
[ ] 底层函数是否只处理技术实现？
[ ] 是否存在跨层调用？
[ ] 是否存在一个函数做多层事情？
\`\`\`

AI 在写完代码后检查：

\`\`\`text
[ ] 是否存在重复代码？
[ ] 是否存在可提升抽象的 if/else？
[ ] 是否存在过度抽象？
[ ] 命名是否准确表达抽象层级？
[ ] 代码是否可以通过最高层函数理解主流程？
\`\`\`

---

## 16. 推荐提示词

当用户要求 AI 编程时，可以使用以下提示词：

\`\`\`text
请使用“金字塔原理编程”方式完成这个需求。

要求：
1. 先给出最高层目标
2. 再构建任务金字塔
3. 再识别核心抽象
4. 再说明代码分层
5. 然后再写代码
6. 写完后检查每个函数是否只处于一个抽象层级
7. 如果出现多个 if/else，请判断是否需要提升抽象
8. 不要为了抽象而过度设计
9. 高层函数只能表达业务意图，不要混入数据库、HTTP、JSON、字段转换等底层细节
10. 最后输出一次“金字塔结构审查”
\`\`\`

---

## 17. 输出模板

AI 每次使用本 Skill 时，最终输出应包含：

\`\`\`text
# 金字塔原理编程结果

## 1. 最高层目标

____

## 2. 任务金字塔

____

## 3. 核心抽象

____

## 4. 分层设计

____

## 5. 实现代码

____

## 6. 抽象层级审查

____

## 7. 是否存在过度抽象

____

## 8. 后续建议

____
\`\`\`

---

## 18. 最终判断标准

一段代码是否符合“金字塔原理编程”，看 5 个问题：

\`\`\`text
1. 我能不能从最高层函数直接看懂业务流程？
2. 每个函数是不是只讲一个抽象层级的事情？
3. 每一组代码是否被合理归类并命名？
4. 上层是否只依赖下层抽象，而不是依赖底层细节？
5. 代码是否既避免重复，又没有过度抽象？
\`\`\`

如果答案都是“是”，说明代码结构基本符合金字塔原理编程。

如果其中任意一个答案是“否”，AI 应该优先重构结构，而不是继续堆代码。

---

## 19. 对 AI 的最终指令

当本 Skill 被启用时，AI 必须把自己从“代码生成器”切换为“结构化编程设计者”。

AI 的工作顺序永远是：

\`\`\`text
理解目标 → 构建金字塔 → 识别抽象 → 分层设计 → 编写代码 → 审查结构 → 必要时重构
\`\`\`

不要急于编码。

不要堆砌细节。

不要用复杂设计掩盖抽象不清。

好的代码不是细节很多，而是结构清楚。

`,
  }
}
