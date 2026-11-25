// Local operator simulation. No network, persistent customer data or payment credentials.
import { pathToFileURL } from 'node:url';
import { supportAction } from '../src/ecosystem/support-state.js';

export function createSandbox() {
  const records = new Map();
  return {
    preview(id, amount) {
      const offer = supportAction('SANDBOX', amount);
      if (offer.state !== 'sandbox-preview') return offer;
      if (records.has(id)) {
        const previous = records.get(id);
        if (previous.cents !== offer.cents) throw Error('Amount changed for the same simulation ID');
        return {...previous};
      }
      const record = {id, cents:offer.cents, currency:'EUR', state:'pending', simulated:true};
      records.set(id,record);
      return {...record};
    },
    transition(id, next) {
      const record = records.get(id);
      if (!record) throw Error('Unknown simulation ID');
      if (record.state === next) return {...record};
      const allowed = {pending:['succeeded','failed'], succeeded:['refunded'], failed:[], refunded:[]};
      if (!allowed[record.state].includes(next)) throw Error('Invalid simulation transition');
      record.state = next;
      return {...record};
    }
  };
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, ,amount='5.00', outcome='succeeded']=process.argv;
  const sandbox=createSandbox(), p=sandbox.preview('local',amount);
  console.log('SANDBOX · simulation only');
  console.log(p);
  if (p.state==='pending') {
    if(outcome==='refunded') sandbox.transition('local','succeeded');
    console.log(sandbox.transition('local',outcome));
  }
}
