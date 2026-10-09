const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('page/autopilot-settings-tab.js','utf8');
function setup(){
  const elements=new Map();
  const context=vm.createContext({window:{},document:{getElementById:id=>elements.get(id),createElement:()=>({}),head:{append:el=>elements.set(el.id,el)}}});
  vm.runInContext(source,context);
  class EAView{}
  class EAViewController{}
  class UTGameFlowNavigationController{initWithRootController(root){this.root=root}}
  class UTTabBarItemView{init(){}setTag(tag){this.tag=tag}getTag(){return this.tag}setText(text){this.text=text}addClass(){}}
  class UTGameTabBarController{
    initWithViewControllers(controllers,...args){this.calls=(this.calls||0)+1;this.controllers=controllers;this.args=args;return this.result;}
    setSelectedIndex(index){this.selected=index;}
  }
  const classes={EAView,EAViewController,UTGameFlowNavigationController,UTTabBarItemView,UTGameTabBarController};
  return {api:context.window.AutopilotSettingsTab,classes,elements};
}
test('native registration preserves other tabs, receiver, arguments and return value',()=>{
  const {api,classes}=setup();
  assert.equal(api.installNative({},classes),true);
  const existing=[{tabBarItem:{getTag:()=>27100},name:'EA'},{name:'Enhancer'},{name:'Paletools'}];
  const tabs=new classes.UTGameTabBarController();tabs.result={native:true};
  const result=tabs.initWithViewControllers(existing,'extra',42);
  assert.equal(result,tabs.result);assert.equal(tabs.calls,1);
  assert.deepEqual(tabs.args,['extra',42]);
  assert.equal(existing.length,4);assert.equal(existing[1].name,'Enhancer');
  assert.equal(existing[3].tabBarItem.getTag(),27101);
  assert.equal(existing[3].tabBarItem.text,'Autopilot');
  assert.equal(existing[3].root.getNavigationTitle(),'AutopilotSBC');
});
test('reinstallation and a later extension wrapper still register exactly one Autopilot',()=>{
  const {api,classes,elements}=setup();api.installNative({},classes);
  const first=classes.UTGameTabBarController.prototype.initWithViewControllers;
  api.installNative({},classes);
  assert.equal(classes.UTGameTabBarController.prototype.initWithViewControllers,first);
  const outer=function(...args){this.otherCalls=(this.otherCalls||0)+1;return first.apply(this,args);};
  classes.UTGameTabBarController.prototype.initWithViewControllers=outer;
  api.installNative({},classes);
  const tabs=new classes.UTGameTabBarController(),list=[];
  tabs.initWithViewControllers(list);tabs.initWithViewControllers(list);
  assert.equal(list.filter(c=>c.__autopilotSettingsNavigation).length,1);
  assert.equal(tabs.otherCalls,2);assert.equal(tabs.calls,2);
  assert.equal(elements.size,1);
});
test('an initialized tab bar is not changed and missing EA classes can be polled later',()=>{
  const {api,classes}=setup();assert.equal(api.installNative({},{}),false);
  assert.equal(api.isInstalled(),false);assert.equal(api.installNative({},classes),true);
  const tabs=new classes.UTGameTabBarController();tabs.initialized=true;const list=[{name:'EA'}];
  tabs.initWithViewControllers(list);assert.equal(list.length,1);
});
test('the public navigation entry selects the actual controller index',()=>{
  const {api,classes}=setup();api.installNative({},classes);
  const tabs=new classes.UTGameTabBarController(),list=[{name:'EA'},{name:'Enhancer'}];
  tabs.initWithViewControllers(list);tabs.childViewControllers=list;
  assert.equal(api.open(),true);assert.equal(tabs.selected,2);
});
