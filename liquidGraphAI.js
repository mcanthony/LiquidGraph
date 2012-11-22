/*********** The file for all the AI work. It's ironic that the AI code will be only a few
             hundred lines, while all the physics / graphics / UI are huge.

                                                                                ********/

/********* Classes **********/

function Node(locationObjs, accelDirection) {
  if (!accelDirection) { throw new Error("need field accel at this node!"); }

  this.locationObjs = locationObjs;
  this.isGoal = false;
  this.cvs = null;

  this.locationName = this.stringifyLocations(locationObjs);

  // TODO HACKED UP GOAL CALCULATION, this needs to be total
  if (/offScreen/.test(this.locationName)) {
    this.isGoal = true;
  }


  if (!this.isGoal) {
    // TODO we need to pass in all the location objs...
    //console.log('the location objs are', locationObjs, 'for cvs');
    this.cvs = new ConcaveVertexSampler(locationObjs, accelDirection);
  }
}

Node.prototype.stringifyLocations = function(locationObjs) {
 var tupleEntries = [];
  _.each(locationObjs, function(locationObj, i) {
    // we are only the goal if ALL of our entries are offscreen
    tupleEntries.push(((locationObj.id) ? String(locationObj.id) : 'offScreen'));
  }, this);

  return '(' + tupleEntries.join(',') + ')';
};

Node.prototype.expand = function() {
  this.cvs.sampleConnectivity();
  //DEBUG / OPTIONAL -- animate connectivity
  //this.cvs.animateConnectivity();

  var connectedObjects = [];
  _.each(this.cvs.getNameToLocations(), function(locationObjs, locationName) {
    connectedObjects.push(locationObjs);
  }, this);

  console.log('THESE CONNECTED ojects', connectedObjects);
  console.log('names', this.cvs.connectedNodeNames);

  return connectedObjects;
}

function PartialPlan(parentPlan,node) {
  // if no parent plan, then we start with an empty array
  this.nodes = (parentPlan) ? parentPlan.nodes.slice(0) : [];

  this.nodes.push(node);

  this.totalTime = this.calculateTotalTime(this.nodes);
}

PartialPlan.prototype.calculateTotalTime = function(nodes) {
  var totalTime = 0;

  for (var i = 0; i < nodes.length - 1; i++) {
    //for every node -> node connection in our partial plan,
    //calculate the time and add it
    var sourceNode = nodes[i];
    var destNode = nodes[i+1];

    var name = destNode.locationName;
    var time = sourceNode.cvs.getConnectivity()[name].time;

    totalTime += time;
  }

  return totalTime;
};

PartialPlan.prototype.lastNode = function() {
  return this.nodes[this.nodes.length - 1];
};

function GraphSearcher(concaveVertices) {
  //the initial accel will just be negated sum of
  //the two edge outward normals, scaled to the length of the field
  //accel
  var iv = concaveVertices[0];

  // TODO -- starting acceleration calculation revamp. needs to be some average of all of these
  // nodes.... hmm ? maybe not
  var gDirection = vecNormalize(vecAdd(iv.inEdge.outwardNormal,iv.outEdge.outwardNormal));
  var startAccel = vecScale(vecNegate(gDirection),vecLength(globalAccel));
  this.startAccel = startAccel;

  //this is the standard UCS. aka have a priority queue of partial plans,
  //a closed set for visited graphs, etc.

  this.poppedPlans = [];
  this.goalPlans = [];
  this.visitedStates = {};
  
  this.planPriorityQueue = [];
  this.sortFunction = function(a,b) {
      return a.totalTime - b.totalTime;
  };

  var n = new Node(concaveVertices,startAccel);
  var plan = new PartialPlan(null, n);

  this.planPriorityQueue.push(plan);
  this.planPriorityQueue.sort(this.sortFunction);
};

GraphSearcher.prototype.printPlan = function(plan) {
  var str = '';
  _.each(plan.nodes, function(n, i) {
    str += n.locationName
    str += (i < plan.nodes.length - 1) ? '->' : '';
  });

  console.log("This plan is: ", str);
};

GraphSearcher.prototype.searchStep = function() {
    //pop off the top plan
    var planToExpand = this.planPriorityQueue.shift();

    console.log('the plan i popped or shifted was', planToExpand);
    if (planToExpand) {
      this.printPlan(planToExpand);
    }

    if (!planToExpand) {
      if (!WORST) {
        return "NoSolution";
      }

      console.log('trying to find worst solution because i exhausted all...');
      // see if we found any goal
      if (!this.goalPlans.length) {
        return "NoSolution";
      }
      this.solution = this.goalPlans.pop();
      this.buildSolutionAnimation();
      return "FoundSolution";
    }

    var topNodeName = planToExpand.lastNode().locationName;
    if (this.visitedStates[topNodeName]) {
      console.log('already visited state', topNodeName);
      return;
    }

    //expand this top node to get a bunch of other nodes
    var nodeToExpand = planToExpand.nodes[planToExpand.nodes.length - 1];

    // now we are actually expanding a plan from here
    this.poppedPlans.push(planToExpand);
    this.printPlan(planToExpand);

    if (nodeToExpand.isGoal) {
      if (!WORST) {
        this.solution = planToExpand;
        this.buildSolutionAnimation();
        return "FoundSolution";
      }
      // want to just add this
      this.goalPlans.push(planToExpand);
      this.goalPlans.sort(this.sortFunction);
      return;
    }
    this.visitedStates[topNodeName] = true;

    var newLocationObjects = nodeToExpand.expand();
    for (var i = 0; i < newLocationObjects.length; i++) {
        // TODO: all location objects??
        var newNode = new Node(newLocationObjects[i], this.startAccel);

        var newPlan = new PartialPlan(planToExpand,newNode);
        this.planPriorityQueue.push(newPlan);
    }

    //maintain the priorty queue
    this.planPriorityQueue.sort(this.sortFunction);
    if (WORST) {
      this.planPriorityQueue.reverse();
    }

    var times = [];
    for (var i = 0; i < this.planPriorityQueue.length; i++) {
      times.push(this.planPriorityQueue[i].totalTime);
    }

    console.log("SORTED LIST OF TIMES IS");
    console.log(times.join(','));

    //not at goal yet
    return "StillSearching";
};

GraphSearcher.prototype.search = function() {

    this.searchStepAsync();
};

GraphSearcher.prototype.searchStepAsync = function() {
    var results = this.searchStep();
    if (debug) {
      gs = this;
      console.log(this);
      return;
    }

    var poppedPlan = this.poppedPlans[this.poppedPlans.length - 1];

    if (results == "FoundSolution") {
      topNotify("Found a solution!");
      //console.log("Found a solution!");
      var _this = this;

      setTimeout(function() {
          _this.animateSolution();
      }, 3000);
    } else if (results == "NoSolution") {
      topNotify("No Solution Found");
      partController.clearAll();
    } else {
      var _this = this;
      var f = function() {
          _this.searchStepAsync();
      };
      bAnimator.add(f);
    }
};

GraphSearcher.prototype.buildSolutionAnimation = function() {
    //ok so this is the deal. we need to build a ton of functions that will animate
    //between two arbitrary things. these are the types of functions we will have:

    // gravityTransition:
    //      animates between two different gravity directions. useful for
    //      the initial transition and when "rotating" the board with a
    //      trapped particle

    // gravityParticleTransition:
    //      this one is kinda intense. we will animate a gravity transition WHILE
    //      animating a particle.

    // nodeNodeAnimation:
    //
    //      this one is easy. just take two nodes in our plan solution,
    //      get the transition particle, and animate that sucker.

    this.animateStepFunctions = [];

    //first, pop on a function that takes in the global accel and rotates to the starting accel

    var _this = this;
    var initialAccel = globalAccel;
    var lastG = globalAccel;

    // ugh, ideally we would have a ring that is just consistent through all animations,
    // but since there are a bunch of different kinetic paths all joining up together,
    // its a lot of work to refactor that...
    this.rings = [];
    _.each(this.solution.nodes[0].cvs.concaveVertices, function(cv) {
      var ring = p.circle(cv.x, cv.y, 40, 40);
      ring.attr({
        'stroke-width':5,
        'stroke':'rgba(255,255,255,0.5)',
        'fill':'rgba(0,0,0,0)'
      });
      this.rings.push(ring);
    }, this);

    var hackyPos = this.solution.nodes[0].cvs.concaveVertices[0];
    this.pBody = cuteSmallCircle(hackyPos.x,hackyPos.y);

    //now loop through nodes
    for(var i = 0; i < this.solution.nodes.length -1; i++) {
      //get information
      var sourceNode = this.solution.nodes[i];
      var destNode = this.solution.nodes[i+1];
      var name = destNode.locationName;

      // go get the action for this jump and vectors
      var actionResults = sourceNode.cvs.getConnectivity()[name].actionResults;
      var startingG = actionResults.action.startG;
      var realEndG = actionResults.calcRealEndG();

      var animation = sourceNode.cvs.animationInfo[name];
      var transParticle = animation.transParticle;

      var timeToTransition = animation.timeToTransition;

      var time = 15;
      if (i == 0) { time = time * 1.5; }

      var gravTransition = this.makeGravityClosure(lastG,startingG,time,i);

      //ok so to animate a solution, first transition between these gravity directions
      this.animateStepFunctions.push(gravTransition);

      //then animate between the startingG, the realEndG, WHILE animating the particle
      var gravParticleTransition = this.makeGravityParticleTransitionClosure(startingG,realEndG,
                                                      transParticle,timeToTransition);
      this.animateStepFunctions.push(gravParticleTransition);

      lastG = realEndG;

      //then animate the actual node node animation
      var particleAnimation = this.makeNodeNodeClosure(i);
      this.animateStepFunctions.push(particleAnimation);
    }

    //push one to return to our original position
    gravTransition = this.makeGravityClosure(lastG,initialAccel,time,"end");
    this.animateStepFunctions.push(gravTransition);
};

GraphSearcher.prototype.animateSolution = function() {
  if (!this.solution) {
      throw new Error("no solution to animate!"); 
  }
  partController.clearAll();

  solveController.isAnimating = true;

  solveController.UIbutton.hideAllButtons();

  this.animateStepNum = 0;

  this.animateStep();
};

GraphSearcher.prototype.finishAnimation = function() {
  //we are done, clean up after ourselves
  topNotifyClear();
  this.pBody.remove();
  _.each(this.rings, function(ring) { ring.remove(); });

  solveController.UIbutton.anchorClick();
  solveController.UIbutton.showMainButtons();

  //also tell the solve UI that we are done
  solveController.isAnimating = false;

  partController.clearAll();

  //if this is the demo, keep solving for a bit
  if (/demo/.test(location.href)) {
    solveController.UIbutton.anchorClick();
  }
};


GraphSearcher.prototype.animateStep = function() {
  if (this.animateStepNum >= this.animateStepFunctions.length) {
    this.finishAnimation();
    return;
  }

  //animating!!
  this.animateStepFunctions[this.animateStepNum]();
  this.animateStepNum++;
};

GraphSearcher.prototype.makeGravityParticleTransitionClosure = function(startingG,realEndG,transParticle,timeToTransition) {
  var gravParticleTransition = _.bind(function() {
    this.gravityAnimation(startingG,realEndG,timeToTransition);
    transParticle.animate();
  }, this);
  return gravParticleTransition;
};

GraphSearcher.prototype.makeGravityClosure = function(startG,endG,time,index) {
  var gravTransition = _.bind(function() {
    //do a big zoom in on the first
    if (index == 0) {
      this.pBody.attr({
          r:200
      });
      this.pBody.animate({
          r:4
      },1000,'easeIn');
    }

    this.gravityAnimation(startG,endG,time);
  }, this);
  return gravTransition;
};

GraphSearcher.prototype.gravityAnimation = function(gStart,gEnd,time) {
  if (undefined /*transPos*/) {
    this.pBody.attr({
        cx:transPos.x,
        cy:transPos.y
    });
    this.ring.attr({
        cx:transPos.x,
        cy:transPos.y
    });
    this.ring.show();
    this.pBody.show();
  }

  var doneFunction = _.bind(function() {
    this.animateStep();
    this.pBody.hide();
    _.each(this.rings, function(ring) { ring.remove(); });
  }, this);

  var gt = new GravityTweener(gStart,gEnd,time,doneFunction);
  gt.start();
};

GraphSearcher.prototype.makeNodeNodeClosure = function(nodeIndex) {
  var _this = this;
  var particleAnimation = function() {
      _this.nodeNodeAnimation(nodeIndex);
  };
  return particleAnimation;
};

GraphSearcher.prototype.nodeNodeAnimation = function(nodeIndex) {
  if (nodeIndex >= this.solution.nodes.length -1) {
      console.warn("called particle animation for a node that didn't exist");
      //we are done!
      return;
  }

  var i = nodeIndex;

  var nodes = this.solution.nodes;
  var sourceNode = nodes[i];
  var destNode = nodes[i+1];
  var name = destNode.locationName;

  var animation = sourceNode.cvs.animationInfo[name];

  //ok we would like to animate this particle and then have it call ourselves
  //when it's done
  var _this = this;
  var done = function() {
      _this.animateStep();
  };

  animation.particle.animate(done,true);
  partController.add(animation.particle);
};

