'use strict';

function createDropScheduler({ client,service,logger }) {
  let timer, running, stopped=false, retryAfter=0;
  const trackChat = (channel,user,message,self) => {
    if (self || stopped) return;
    service.trackChat(user['user-id']).catch(err => logger.error('Brew activity update failed',{ err:err.message }));
  };
  async function tick() {
    if (stopped || running || Date.now()<retryAfter) return;
    running = (async () => {
      try {
        if (!await service.due()) return;
        const viewers = await client.getChatters();
        await service.drop(viewers,client.botUser.id);
      } catch (err) {
        retryAfter=Date.now()+60000;
        logger.error('Brew drop cycle failed',{ err:err.message });
      }
    })().finally(() => { running=null; });
    return running;
  }
  function start() {
    if (timer || stopped) return;
    timer=setInterval(tick,15000);
    timer.unref();
    tick();
  }
  async function stop() {
    stopped=true;
    clearInterval(timer);
    client.off('message',trackChat);
    await running;
  }
  client.on('message',trackChat);
  return { start,stop,tick };
}

module.exports = { createDropScheduler };
