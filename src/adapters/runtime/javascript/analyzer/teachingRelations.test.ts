import { describe, expect, it } from 'vitest';
import { analyzeJavaScriptSource } from './instrumentJavaScript';
import type { JavaScriptTeachingGoal } from '../../../../core/content/javascriptTeachingGoals';

const request = {
  requestId: 'teaching-relation-test',
  exerciseSessionId: 'teaching-relation-session',
  executionRevision: 1,
  file: 'script.js',
  sourceType: 'script' as const,
  capabilityProfile: 'core' as const,
  guardIdentifier: '__tsumuRelationBudget',
};

/** 実Analyzerの関係factだけを読み、存在factやConsole結果を代用しない。 */
async function relations(source: string, teachingGoal?: JavaScriptTeachingGoal) {
  const result = await analyzeJavaScriptSource({
    ...request,
    source,
    capabilityProfile: teachingGoal?.startsWith('promise-') ? 'async' : 'core',
    ...(teachingGoal === undefined ? {} : { teachingGoal }),
  });
  expect(result.status).toBe('success');
  return result.status === 'success'
    ? result.facts.filter((fact) => (fact.kind as string) === 'teaching-relation')
    : [];
}

const groupOne = [
  {
    goal: 'console-primitives',
    correct: "console.log('問題1'); console.log(3); console.log(true);",
    incorrect:
      "const n=3; const b=true; console.log('問題1');console.log('3');console.log('true');",
  },
  {
    goal: 'question-binding',
    correct: "const questionText='問題2を始めます'; console.log(questionText);",
    incorrect: "const questionText='別の値'; console.log('問題2を始めます');",
  },
  {
    goal: 'score-update',
    correct: 'let score=10; score+=5; console.log(score);',
    incorrect: 'let score=10; score+=0; console.log(15);',
  },
  {
    goal: 'answer-branch',
    correct:
      "const answer='A'; if(answer==='A'){console.log('正解です');}else{console.log('不正解です');}",
    incorrect:
      "const answer='A';const unused=answer==='A';if(answer!=='A'){console.log('不正解です');}else{console.log('正解です');}",
  },
  {
    goal: 'answer-chain',
    correct:
      "const answer='B';if(answer==='A'){console.log('Aです');}else if(answer==='B'){console.log('Bです');}else{console.log('その他です');}",
    incorrect:
      "const answer='B';if(answer==='A'){console.log('Aです');}else if(answer==='A'){console.log('その他です');}else{console.log('Bです');}",
  },
  {
    goal: 'question-loop',
    correct: "for(let number=1;number<=3;number++){console.log('問題'+number);}",
    incorrect:
      "for(let number=4;number<=3;number++){}console.log('問題1');console.log('問題2');console.log('問題3');",
  },
  {
    goal: 'question-function',
    correct: "function showQuestion(){console.log('問題1: 2 + 3 は？');}showQuestion();",
    incorrect:
      "function showQuestion(){}function unused(){showQuestion();}console.log('問題1: 2 + 3 は？');",
  },
  {
    goal: 'label-scope',
    correct:
      "const courseName='JavaScript';function showLabels(){const lessonName='Scope';console.log(courseName);console.log(lessonName);}showLabels();",
    incorrect:
      "const courseName='JavaScript';const lessonName='Scope';function unused(){const lessonName='unused';}function showLabels(){console.log(courseName);console.log(lessonName);}showLabels();",
  },
] as const;

const promiseSource =
  'function loadQuestions(){return new Promise(resolve=>{resolve([{text:"Q"}]);});}';
const promiseErrorSource =
  'function loadQuestions(shouldFail){return new Promise((resolve,reject)=>{if(shouldFail){reject(new Error("fail"));}else{resolve([{text:"Q"}]);}});}';
const loadListener = "document.querySelector('#load').addEventListener('click',showCount);";
const resultListeners =
  "document.querySelector('#success').addEventListener('click',()=>showQuestions(false));document.querySelector('#failure').addEventListener('click',()=>showQuestions(true));";
const groupThree = [
  {
    goal: 'promise-then',
    correct:
      promiseSource +
      "const count=document.querySelector('#count');const question=document.querySelector('#question');document.querySelector('#load').addEventListener('click',()=>{function show(items){count.textContent='問題: '+items.length;question.textContent=items[0].text;}loadQuestions().then(show);});",
    incorrect:
      promiseSource +
      "document.querySelector('#load').addEventListener('click',()=>{loadQuestions();document.querySelector('#count').textContent='問題: 1';document.querySelector('#question').textContent='Q';});",
  },
  {
    goal: 'promise-await',
    correct:
      promiseSource +
      "const count=document.querySelector('#count');async function showCount(){const items=await loadQuestions();count.textContent='問題: '+items.length;}" +
      loadListener,
    incorrect:
      promiseSource +
      "const count=document.querySelector('#count');function showCount(){loadQuestions();count.textContent='問題: 1';}" +
      loadListener,
  },
  {
    goal: 'promise-catch',
    correct:
      promiseErrorSource +
      "const result=document.querySelector('#result');async function showQuestions(shouldFail){try{const items=await loadQuestions(shouldFail);result.textContent='問題: '+items.length;}catch(failure){result.textContent='読み込めませんでした';}}" +
      resultListeners,
    incorrect:
      promiseErrorSource +
      "const result=document.querySelector('#result');function showQuestions(shouldFail){loadQuestions(false);result.textContent=shouldFail?'読み込めませんでした':'問題: 1';}" +
      resultListeners,
  },
] as const;

const closure =
  'function createScoreCounter(){let score=0;return ()=>{score=score+10;return score;};}const addScore=createScoreCounter();';
const array = "const questions=['HTML','CSS','JS'];";
const groupTwo = [
  {
    goal: 'score-closure',
    correct: closure + 'console.log(addScore());console.log(addScore());',
    incorrect: closure + 'console.log(10);console.log(20);',
  },
  {
    goal: 'score-closure-three',
    correct: closure + 'console.log(addScore());console.log(addScore());console.log(addScore());',
    incorrect:
      closure +
      'function unused(){addScore();addScore();addScore();}console.log(10);console.log(20);console.log(30);',
  },
  {
    goal: 'score-closure-instances',
    correct:
      'function createScoreCounter(step){let score=0;return function(){score+=step;return score;};}const a=createScoreCounter(2);const b=createScoreCounter(5);console.log(a());console.log(b());console.log(a());console.log(b());console.log(a());',
    incorrect:
      'function createScoreCounter(step){let score=0;return function(){score+=step;return score;};}const a=createScoreCounter(2);const b=createScoreCounter(5);function unused(){a();b();a();b();a();}console.log(2);console.log(5);console.log(4);console.log(10);console.log(6);',
  },
  {
    goal: 'questions-array',
    correct: array + 'console.log(questions);console.log(questions.length);',
    incorrect: array + "console.log('[HTML,CSS,JS]');console.log(3);",
  },
  {
    goal: 'questions-access',
    correct: array + 'console.log(questions[0]);console.log(questions.at(1));',
    incorrect: array + "const unused=questions[0];console.log('HTML');console.log('CSS');",
  },
  {
    goal: 'questions-for-of',
    correct: array + 'for(const question of questions){console.log(question);}',
    incorrect:
      array +
      "for(const question of []){console.log(question);}console.log('HTML');console.log('CSS');console.log('JS');",
  },
  {
    goal: 'quiz-properties',
    correct:
      "const quiz={question:'Q',answer:5};console.log(quiz.question);console.log(quiz.answer);",
    incorrect:
      "const quiz={question:'Q',answer:0};const unused=quiz.answer;console.log('Q');console.log(5);",
  },
  {
    goal: 'quiz-destructuring',
    correct:
      "const quiz={text:'Q',choices:['3','5','7']};const {text:prompt,choices}=quiz;const [firstChoice]=choices;console.log(prompt);console.log(firstChoice);",
    incorrect:
      "const quiz={text:'Q',choices:['3','5','7']};const {text:prompt,choices}={};const [firstChoice]=[];console.log('Q');console.log('3');",
  },
  {
    goal: 'question-map',
    correct:
      array +
      "const labels=questions.map(function(item){return '問題: '+item;});for(const label of labels){console.log(label);}",
    incorrect:
      array +
      "const labels=questions.map(item=>item);console.log('問題: HTML');console.log('問題: CSS');console.log('問題: JS');",
  },
  {
    goal: 'html-filter',
    correct:
      "const questions=[{category:'HTML',text:'Q'}];const htmlQuestions=questions.filter(item=>'HTML'===item.category);for(const question of htmlQuestions){console.log(question.text);}",
    incorrect:
      "const questions=[{category:'HTML',text:'Q'}];const htmlQuestions=questions.filter(item=>item.category!=='HTML');console.log('Q');",
  },
  {
    goal: 'points-reduce',
    correct:
      'const questions=[{points:10},{points:20},{points:30}];const total=questions.reduce((sum,item)=>item.points+sum,0);console.log(total);',
    incorrect:
      'const questions=[{points:10},{points:20},{points:30}];const total=questions.reduce((sum,item)=>sum+item.points);console.log(60);',
  },
  {
    goal: 'answered-map',
    correct:
      'const questions=[{answered:false}];const answeredQuestions=questions.map(function(item){return {...item,answered:true};});console.log(questions[0].answered);console.log(answeredQuestions[0].answered);',
    incorrect:
      'const questions=[{answered:false}];const answeredQuestions=questions.map(item=>({...item,answered:false}));console.log(false);console.log(true);',
  },
  {
    goal: 'caught-error',
    correct:
      "function readQuestion(question){if(question.text===''){throw new Error('問題文がありません');}return question.text;}try{console.log(readQuestion({text:''}));}catch(error){console.log(error.message);}",
    incorrect:
      "function readQuestion(question){if(question.text===''){throw new Error('古い');}return question.text;}try{console.log(readQuestion({text:''}));}catch(error){console.log('問題文がありません');}",
  },
] as const;

describe('指定Goalの同じbinding/ownerから実sinkへ接続する', () => {
  it.each(groupOne)(
    '$goal: 正答の関係だけを1factへ集約する',
    async ({ goal, correct, incorrect }) => {
      expect(await relations(correct, goal)).toHaveLength(1);
      expect(await relations(incorrect, goal)).toHaveLength(0);
    },
  );
  it.each(groupTwo)(
    '$goal: 更新/変換/捕捉の結果を同じsinkへ繋ぐ',
    async ({ goal, correct, incorrect }) => {
      expect(await relations(correct, goal)).toHaveLength(1);
      expect(await relations(incorrect, goal)).toHaveLength(0);
    },
  );
  it.each(groupThree)(
    '$goal: Promise受信値/失敗を登録handlerのnative DOMへ繋ぐ',
    async ({ goal, correct, incorrect }) => {
      expect(await relations(correct, goal)).toHaveLength(1);
      expect(await relations(incorrect, goal)).toHaveLength(0);
    },
  );
  it('既存then-equivalentとpromise-catchの正当別解を保持する', async () => {
    expect(
      await relations(
        promiseSource +
          "const count=document.querySelector('#count');function showCount(){loadQuestions().then(items=>{count.textContent='問題: '+items.length;});}" +
          loadListener,
        'promise-await',
      ),
    ).toHaveLength(1);
    expect(
      await relations(
        promiseErrorSource +
          "const result=document.querySelector('#result');function showQuestions(shouldFail){loadQuestions(shouldFail).then(items=>{result.textContent='問題: '+items.length;}).catch(failure=>{result.textContent='読み込めませんでした';});}" +
          resultListeners,
        'promise-catch',
      ),
    ).toHaveLength(1);
  });

  it('native selector上書きや同selectorの別alias text上書きを関係証拠にしない', async () => {
    const correct = groupThree[1].correct;
    const nativeOverwrite = correct
      .replace(
        "const count=document.querySelector('#count');",
        "const loadButton=document.querySelector('#load');document.querySelector=()=>({textContent:''});const count=document.querySelector('#count');",
      )
      .replace(loadListener, "loadButton.addEventListener('click',showCount);");
    const textOverwrite = correct.replace(
      "count.textContent='問題: '+items.length;",
      "count.textContent='問題: '+items.length;document.querySelector('#count').innerText='問題: 1';",
    );
    const aliasOverwrite = correct
      .replace(
        "const count=document.querySelector('#count');",
        "const count=document.querySelector('#count');const alias=count;",
      )
      .replace(
        "count.textContent='問題: '+items.length;",
        "count.textContent='問題: '+items.length;alias.innerText='問題: 1';",
      );
    for (const source of [nativeOverwrite, textOverwrite, aliasOverwrite]) {
      expect(await relations(source, 'promise-await')).toHaveLength(0);
    }
  });

  it('一段の安定DOM aliasと既存text write、無関係selector/shadow writeを保持する', async () => {
    const correct = groupThree[1].correct;
    const alias = correct
      .replace(
        "const count=document.querySelector('#count');",
        "const target=document.querySelector('#count');const count=target;",
      )
      .replace('count.textContent', 'count.innerText');
    const unrelated =
      correct +
      "document.querySelector('#note').innerText='ready';function unused(){const count={textContent:''};count.innerText='ignored';}";
    expect(await relations(alias, 'promise-await')).toHaveLength(1);
    expect(await relations(unrelated, 'promise-await')).toHaveLength(1);
  });

  it('未指定Goalは正答でも新関係factを返さない', async () => {
    expect(await relations(groupOne[1].correct)).toHaveLength(0);
  });

  it.each([
    "let questionText='正しい';questionText='別';console.log(questionText);",
    "const questionText='正しい';function unused(){console.log(questionText);}console.log('正しい');",
    "const questionText='正しい';if(false){console.log(questionText);}console.log('正しい');",
    "const questionText='正しい';const print=console.log;{const console={log:()=>print('正しい')};console.log(questionText);}",
    "const questionText='正しい';function unused(){const questionText='正しい';console.log(questionText);}console.log('正しい');",
  ])('questionTextの上書き/未使用/shadow/dead ownerを借用しない: %s', async (source) => {
    expect(await relations(source, 'question-binding')).toHaveLength(0);
  });

  it('無関係な別scopeの同名writeと括弧/別bindingは正答を拒否しない', async () => {
    const source =
      "const questionText='正しい';function unused(){let questionText='別';questionText='変更';}let unrelated=0;unrelated++;console.log((questionText));";
    expect(await relations(source, 'question-binding')).toHaveLength(1);
  });

  it('loopのprefix更新とoperand逆順の同じ接続を保持する', async () => {
    expect(
      await relations(
        "for(let number=1;number<=3;++number){console.log(number+'問題');}",
        'question-loop',
      ),
    ).toHaveLength(1);
  });
});
