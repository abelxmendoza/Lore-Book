import type { SelfStatement } from './types';

export class SelfTypeClassifier {
  refineSelfType(statement: SelfStatement): SelfStatement {
    if (/future/.test(statement.text)) {
      statement.selfType = 'future_self';
    }
    if (/scared|fear/.test(statement.text)) {
      statement.selfType = 'feared_self';
    }
    if (/best self|ideal|optimize/i.test(statement.text)) {
      statement.selfType = 'ideal_self';
    }

    statement.confidence += 0.1;
    return statement;
  }
}

