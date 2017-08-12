
function getNextBranch() {
  /*
  {
      stake: [3, 4, 5],
      outputs: {
        "SOMEADDR": 23,
        "OTHERADDR": 43,
      },
      latestIndex: 1
  };
  */
  let multisigs = [];
  for(var i = flashTree.length; i-- > 0;) {
    if(flashTree[i].children.length == MAX_USES) {
      flashTree[i] = {
        index: state.latestIndex++,
        children: [],
        transfers: []
      };
    }
    multisigs.unshift(flashTree[i]);
    if(i < flashTree.length - 1) {

    }
    if(flashTree[i].transfers.length < MAX_USES && flashTree[i].transfers.length != 0) {
      break;
    }
  }
}

