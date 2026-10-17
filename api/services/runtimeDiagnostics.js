// Installed before server dependencies. Never serialize arguments: even an
// unlabelled Error/message or a nested getter can contain a password or SQL.
const write=process.stderr.write.bind(process.stderr);
for(const level of ['log','info','debug','warn','error','trace','dir','table']){
  console[level]=()=>write(JSON.stringify({event:'runtime.diagnostic',level})+'\n');
}
process.on('uncaughtException',()=>{
  write('{"event":"runtime.fatal","kind":"uncaughtException"}\n');process.exit(1);
});
process.on('unhandledRejection',()=>{
  write('{"event":"runtime.fatal","kind":"unhandledRejection"}\n');process.exit(1);
});
