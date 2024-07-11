// Import JSON data
let player, defaults, artifacts, translator, items, enemyTypes, permanent;

Promise.all([
    fetch('data/player.json').then(response => response.json()),
    fetch('data/artifacts.json').then(response => response.json()),
    fetch('data/translator.json').then(response => response.json()),
    fetch('data/items.json').then(response => response.json()),
    fetch('data/enemyTypes.json').then(response => response.json()),
    fetch('data/permanent.json').then(response => response.json())
]).then(([playerData, artifactsData, translatorData, itemsData, enemyTypesData, permanentData]) => {
    player = playerData;
    defaults = { ...playerData };
    artifacts = artifactsData;
    translator = translatorData;
    items = itemsData;
    enemyTypes = enemyTypesData;
    permanent = permanentData;
    // Convert string functions to actual functions for artifacts
    for (let artifactName in artifacts) {
        if (artifacts[artifactName].onGet) {
            artifacts[artifactName].onGet = new Function(artifacts[artifactName].onGet);
        }
        if (artifacts[artifactName].onDiscard) {
            artifacts[artifactName].onDiscard = new Function(artifacts[artifactName].onDiscard);
        }
    }

    // Convert string functions to actual functions for items
    for (let itemName in items) {
        if (items[itemName].onUse) {
            items[itemName].onUse = new Function(items[itemName].onUse);
        }
    }

    // Convert string functions to actual functions for enemy special attacks
    for (let enemyType in enemyTypes) {
        if (enemyTypes[enemyType].specialAttack && enemyTypes[enemyType].specialAttack.execute) {
            enemyTypes[enemyType].specialAttack.execute = new Function('enemy', 'allEnemies', 'player', enemyTypes[enemyType].specialAttack.execute);
        }
    }

    // Initialize the game
    initializeGame();
}).catch(error => console.error('Error loading game data:', error));

// Function to show tooltip
function showTooltip(artifactName) {
    const tooltip = document.getElementById(`tooltip-${artifactName}`);
    tooltip.style.visibility = 'visible';
    tooltip.style.opacity = 1;
}

// Function to hide tooltip
function hideTooltip() {
    const tooltips = document.querySelectorAll('.tooltiptext');
    tooltips.forEach(tooltip => {
        tooltip.style.visibility = 'hidden';
        tooltip.style.opacity = 0;
    });
}

// Initialize tooltips for each artifact
const artifactElements = document.querySelectorAll('.tooltip');
artifactElements.forEach(artifact => {
    const tooltipTrigger = artifact.innerText.trim().replace(/\//g, '');
    const tooltipText = translator[tooltipTrigger];
    const tooltipSpan = artifact.querySelector('.tooltiptext');
    if (tooltipText) {
        tooltipSpan.textContent = tooltipText;
    }
});

let currentWave = 1;
let currentEnemies = [];
let selectedEnemy = null;
let statMod = 1;
let potionPrice = 10;

function generateEnemies() {
    const enemyCount = Math.min(Math.floor(1 + (currentWave / 8)), 6);
    const enemyTypesArray = Object.keys(enemyTypes);
    currentEnemies = [];

    // Object to keep track of enemy counts
    const enemyTypeCounts = {};

    for (let i = 0; i < enemyCount; i++) {
        const randomType = enemyTypesArray[Math.floor(Math.random() * enemyTypesArray.length)];

        if (!enemyTypeCounts[randomType]) {
            enemyTypeCounts[randomType] = 0;
        }

        enemyTypeCounts[randomType]++;
        const count = enemyTypeCounts[randomType];

        // Apply unique notation only if there are multiple of the same type
        const uniqueType = count > 1 ? `${randomType} ${String.fromCharCode(64 + count)}` : randomType;

        currentEnemies.push(createEnemy(randomType, uniqueType));
    }

    selectedEnemy = 0;
}

function createEnemy(baseType, uniqueType) {
    const baseStats = enemyTypes[baseType];
    return {
        ...baseStats,
        maxHealth: Math.round(baseStats.maxHealth * statMod),
        health: Math.round(baseStats.health * statMod),
        attack: Math.round(baseStats.attack * statMod),
        defense: Math.round(baseStats.defense * statMod),
        experience: Math.round(baseStats.experience * statMod),
        type: uniqueType,
        tempDefense: 0,
        shattered: false,
        weakness: false,
        frozenCounter: 0,
    };
}

function updateUI() {
    // Update player stats display
    document.getElementById('player-stats').innerHTML = `
        You: Level ${player.level}<br>
        HP ${player.health}/${player.maxHealth} | ATK ${player.attack} (+${player.tempAttack}) | DEF ${player.defense} (+${player.tempDefense})<br>
        ${player.experience} xp | ${player.gold}G
    `;

    document.getElementById('souls-counter').innerHTML = `Souls: ${permanent.souls}`

    // Update enemy container display
    const enemyContainer = document.getElementById('enemy-container');
    enemyContainer.innerHTML = '';
    currentEnemies.forEach((enemy, index) => {
        const enemyElement = document.createElement('div');
        enemyElement.classList.add('enemy');
        if (selectedEnemy === index) {
            enemyElement.classList.add('selected');
        }
        enemyElement.innerHTML = `
            ${enemy.type}<br>
            HP ${enemy.health}/${enemy.maxHealth}<br>
            ATK ${enemy.attack} | DEF ${enemy.defense} (+${enemy.tempDefense})<br>
            Special: ${enemy.specialAttack.name}
        `;
        enemyElement.onclick = () => selectEnemy(index);
        enemyContainer.appendChild(enemyElement);
    });

    // Update wave title
    const waveTitle = document.getElementById('wave-title');
    waveTitle.textContent = `Wave ${currentWave}`;

    updateArtifacts();
    updateInventory();
    updateShop();
}

// Update the updateArtifacts function for more resilience
function updateArtifacts() {
    const artifactsContainer = document.getElementById('artifacts');
    artifactsContainer.innerHTML = `<h2>Artifacts Obtained</h2>`;

    if (!player.artifacts || player.artifacts.length === 0) {
        artifactsContainer.innerHTML += `<p>No artifacts obtained yet.</p>`;
    } else {
        const artifactList = player.artifacts.map((artifact, index) => {
            let artifactKey = typeof artifact === 'string' ? artifact : 
                Object.keys(artifacts).find(key => artifacts[key] === artifact) || 'Unknown Artifact';
            let description = (typeof artifact === 'object' && artifact.description) ? artifact.description : 
                (artifacts[artifactKey] ? artifacts[artifactKey].description : 'No description available');
            return `<div class="artifact">
                <p><strong>${artifactKey}</strong><br>${addTooltip(description)}</p>
                <button onclick="discardArtifact(${index})">Discard</button>
                <button onclick="banishArtifact(${index})">Banish</button>
            </div>`;
        }).join('');
        artifactsContainer.innerHTML += artifactList;
    }
}


// Helper function to restore player data after loading
function restorePlayerAfterLoad(savedPlayer) {
    return {
        ...savedPlayer,
        inventory: Object.entries(savedPlayer.inventory).reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {}),
        artifacts: savedPlayer.artifacts.map(artifactKey => artifacts[artifactKey]),
        banishedArtifacts: savedPlayer.banishedArtifacts.map(artifactKey => artifacts[artifactKey])
    };
}

function updateShop() {
    const shopItemsDiv = document.getElementById('shop-items');
    shopItemsDiv.innerHTML = '';

    for (const [key, item] of Object.entries(items)) {
        if (item.price !== undefined) {
            const button = document.createElement('button');
            button.textContent = `Buy ${item.name} (${item.price} gold)`;
            button.onclick = () => buyItem(key);
            shopItemsDiv.appendChild(button);
        }
    }
}

function updateInventory() {
    const inventoryItemsDiv = document.getElementById('inventory-items');
    inventoryItemsDiv.innerHTML = '';

    for (const [key, count] of Object.entries(player.inventory)) {
        if (count > 0) {
            const button = document.createElement('button');
            button.textContent = `Use ${items[key].name} (${count} left)`;
            button.onclick = () => useItem(key);
            inventoryItemsDiv.appendChild(button);
        }
    }
}

function buyItem(itemKey) {
    const item = items[itemKey];
    if (player.gold >= item.price) {
        player.gold -= item.price;
        player.inventory[itemKey] = (player.inventory[itemKey] || 0) + 1;
        item.price += item.priceUpdate || 0;
        log(`You bought a ${item.name}!`);
        updateShop();
        updateInventory();
        updateUI();
    } else {
        log('Not enough gold to buy this item.');
    }
}

function useItem(itemKey) {
    if (player.inventory[itemKey] > 0) {
        player.inventory[itemKey]--;
        items[itemKey].onUse();
        updateInventory();
        updateUI();
    } else {
        log(`You have no ${items[itemKey].name}s to use.`);
    }
}

function discardArtifact(index) {
    const artifact = player.artifacts[index];
    if (artifact.onDiscard) {
        artifact.onDiscard(); // Apply discard effect if defined
    }
    player.artifacts.splice(index, 1); // Remove artifact from artifacts array
    updateUI();
}

function banishArtifact(index) {
    const artifact = player.artifacts[index];
    if (artifact.onDiscard) {
        artifact.onDiscard(); // Apply discard effect if defined
    }
    player.artifacts.splice(index, 1); // Remove artifact from artifacts array
    player.banishedArtifacts.push(artifact); // Add artifact to banished artifacts
    updateUI();
}

// Function to add tooltips based on defined terms
function addTooltip(description) {
    const tooltipRegex = /\/([^\/]+)\//g; // Regex to find terms enclosed in slashes
    return description.replace(tooltipRegex, (match, term) => {
        const tooltipContent = translator[term.trim()];
        if (tooltipContent) {
            return `<span class="tooltip">${term}<span class="tooltiptext">${tooltipContent}</span></span>`;
        }
        return match; // Return original term if not found in translator
    });
}


function selectEnemy(index) {
    selectedEnemy = index;
    updateUI();
    log(`Targeting ${currentEnemies[index].type}.`);
}

function attack() {
    if (selectedEnemy === null) {
        log('Please select an enemy to attack.');
        return;
    }

    const enemy = currentEnemies[selectedEnemy];
    let damage = Math.max(0, (player.attack + player.tempAttack) - (enemy.defense + enemy.tempDefense));
    let critBonusText = "";


    // <Status Effects>
    if (player.shatterImbue && Math.random() < 0.33 && enemy.shattered == false) {
        enemy.shattered = true;
        enemy.defense = 0;
        log(`${enemy.type} has been inflicted with Shattered!`);
    }

    if (player.weaknessImbue && Math.random() < 0.33 && enemy.weakness == false) {
        enemy.weakness = true
        enemy.attack = Math.round(enemy.attack * 0.8);
        log(`${enemy.type} has been inflicted with Weakness!`);
    }

    if (player.iceCharm && Math.random() < 0.15 && enemy.frozenCounter == 0) {
        enemy.frozenCounter == 3
        log(`${enemy.type} has been frozen solid!`);
    }

    if (player.berserkerRage) {
        player.tempAttack += Math.max(1, Math.round(player.attack / 100))
    }
    // </Status Effects>


    // <Damage Mods - Positive>
    if (enemy.health == enemy.maxHealth) {
        damage = Math.max(0, ((player.attack + player.tempAttack) * player.FullHealthExtraDamage) - (enemy.defense + enemy.tempDefense));
    }

    if (player.gof) {
        let damageMod = Math.random() + 0.5;
        damage *= damageMod;
    }

    if (Math.random() < player.critChance + player.tempCritChance) {
        damage *= 2
        critBonusText = " (Crit!)"
    }
    // </Damage Mods - Positive>


    // <Damage Mods - Negative>
    if (player.midas) {
        damage *= 0.9
    }
    // </Damage Mods - Negative>  


    damage = Math.round(damage);


    // <Post damage calc bonuses>
    var midasBonusText = ""
    if (player.midas) {
        midasBonusText = ` You also got ${Math.round(damage / 10)}G.`
        player.gold += Math.round(damage / 10);
    }

    if (player.vampiricHeal > 0) {
        const healAmount = Math.round(damage * player.vampiricHeal);
        player.health = Math.min(player.maxHealth, player.health + healAmount);
        log(`You healed for ${healAmount} HP from your Vampiric Amulet.`);
    }
    // </Post damage calc bonuses>


    enemy.health -= damage;
    log(`You dealt ${damage} damage to the ${enemy.type}${critBonusText}.${midasBonusText}`);

    if (enemy.health <= 0) {
        permanent.souls += 1;
        log(`You defeated the ${enemy.type}!`);
        player.experience += Math.round(enemy.experience * player.experienceMultiplier);
        player.gold += enemy.gold;
        log(`You gained ${Math.round(enemy.experience * player.experienceMultiplier)} EXP and ${enemy.gold} gold!`);
        checkLevelUp();
        currentEnemies.splice(selectedEnemy, 1);

        if (currentEnemies.length > 0) {
            selectedEnemy = selectedEnemy % currentEnemies.length;
            log(`Targeting ${currentEnemies[selectedEnemy].type}.`);
        } else {
            selectedEnemy = null;
        }
    }

    if (currentEnemies.length === 0) {
        nextWave();
    } else {
        updateUI();
        enemyTurn();
    }
}

function defend() {
    player.tempDefense = 1 + Math.round(player.defense / 5)
    document.getElementById('defend-btn').disabled = true;
    log('Nothing will best you! Increase your defense by 20% for the wave.')
    if (player.stoneIdol) {
        log('You get 6 stacks of Stone Skin from the Stone Idol.');
        player.stoneSkinStacks += 6;
    }
    updateUI();
    enemyTurn();
}

function bravery() {
    player.tempAttack = Math.round(player.attack / 2);
    player.tempCritChance += player.bonusCritChance;
    document.getElementById('bravery-btn').disabled = true;
    log('Nothing will best you! Increase your attack by 50% for the wave.')
    updateUI();
    enemyTurn();
}

function enemyTurn() {
    currentEnemies.forEach(enemy => {
        enemy.tempDefense = 0;  // Reset temporary defense
        if (enemy.frozenCounter > 0) {
            enemy.frozenCounter--;
            log(`${enemy.type} is frozen and cannot act!`);
            updateUI();
            return;
        }

        if (player.wither > 0) {
            enemy.health -= Math.round(enemy.maxHealth * player.wither);
            log(`${enemy.type} withers for ${Math.round(enemy.maxHealth * player.wither)} damage.`);
        }

        if (player.age > 0) {
            enemy.attack *= (1 - player.age);
            enemy.attack = Math.floor(enemy.attack);
            enemy.defense *= (1 - player.age);
            enemy.defense = Math.floor(enemy.defense)
            log(`${enemy.type} ages, losing a small bit of combat prowess. It's stats have been lowered.`);
        }

        let damage;
        let attackType = "normal";

        if (Math.random() < 0.3) {  // 30% chance to use special attack
            const result = enemy.specialAttack.execute(enemy, currentEnemies);
            if (typeof result === 'string') {
                log(result);
                return;
            } else {
                damage = Math.max(0, result.damage - (player.defense + player.tempDefense + player.stoneSkinStacks));
                attackType = "special";
            }
        } else {
            damage = Math.max(0, enemy.attack - (player.defense + player.tempDefense + player.stoneSkinStacks));
        }

        // Mirror Shield check
        if (player.mirrorShieldChance > 0 && Math.random() < player.mirrorShieldChance) {
            enemy.health -= damage;
            log(`Your Mirror Shield reflected ${damage} damage back to the ${enemy.type}!`);
            if (enemy.health <= 0) {
                log(`The ${enemy.type} was defeated by the reflected damage!`);
                player.experience += enemy.experience;
                player.gold += enemy.gold;
                log(`You gained ${enemy.experience} EXP and ${enemy.gold} gold!`);
                checkLevelUp();
                currentEnemies = currentEnemies.filter(e => e !== enemy);
            }
        } else {
            player.health -= damage;
            if (attackType === "special") {
                log(result.message);
                log(`You took ${damage} damage from the ${enemy.type}'s special attack.`);
            } else {
                log(`The ${enemy.type} dealt ${damage} damage to you.`);
            }
        }
    });

    if (player.health <= 0 && player.phoenixRevive) {
        player.health = 1;
        player.phoenixRevive = false; // Use up the revival
        log("Your Phoenix Feather brought you back from the brink of death!");
    } else if (player.health <= 0) {
        gameOver();
    } else {
        updateUI();
    }
}

function acquireArtifact() {
    const artifactKeys = Object.keys(artifacts);
    const availableArtifacts = artifactKeys.filter(key =>
        !player.artifacts.includes(artifacts[key]) &&
        !player.banishedArtifacts.includes(artifacts[key])
    );

    if (availableArtifacts.length === 0) {
        log("You already have all available artifacts or they have been banished.");
        return;
    }

    const randomArtifactKey = availableArtifacts[Math.floor(Math.random() * availableArtifacts.length)];
    const randomArtifact = artifacts[randomArtifactKey];

    player.artifacts.push(randomArtifact);
    log(`You found an artifact: ${randomArtifactKey}\n${randomArtifact.description}`);
    if (randomArtifact.onGet) {
        randomArtifact.onGet(); // Apply artifact effect if defined
    }
    updateUI();
}



function nextWave() {
    if (currentWave % 5 === 0) {
        acquireArtifact();
    }
    currentWave++;
    player.stoneSkinStacks = 0;
    player.tempAttack = 0;
    player.tempCritChance = 0;
    document.getElementById('bravery-btn').disabled = false;
    player.tempDefense = 0;
    document.getElementById('defend-btn').disabled = false;
    statMod = parseFloat((statMod * 1.06).toFixed(2));
    log(`Wave ${currentWave} begins! Enemy stats increased by 6%.`);
    clearLog();
    generateEnemies();
    updateUI();
    log(`Targeting ${currentEnemies[selectedEnemy].type}.`);
}

function gameOver() {
    updateUI();
    log('Game Over! You were defeated.');
    document.getElementById('attack-btn').disabled = true;
    document.getElementById('defend-btn').disabled = true;
    document.getElementById('bravery-btn').disabled = true;

    // Disable item buttons
    document.querySelectorAll('#shop-items button').forEach(button => button.disabled = true);
    document.querySelectorAll('#inventory-items button').forEach(button => button.disabled = true);

    log('Press the "New Game" button to start a new run.');
    const newGameBtn = document.createElement('button');
    newGameBtn.textContent = 'New Game';
    newGameBtn.onclick = newGame;
    document.getElementById('action-buttons').appendChild(newGameBtn);
}

// Modify the newGame function to clear the saved game
function newGame() {
    localStorage.removeItem(saveKey);
    player = { ...defaults }; // Reset player to default values
    currentWave = 1;
    currentEnemies = [];
    selectedEnemy = null;
    statMod = 1;
    potionPrice = 10;
    generateEnemies();
    updateUI();
    location.reload();
}

function refresh() {
    location.reload();
}

function checkLevelUp() {
    const expToNextLevel = Math.round(10 * Math.pow(player.level, 3));
    if (player.experience >= expToNextLevel) {
        player.level++;
        player.maxHealth += 2 * player.level;
        player.health += 2 * player.level;
        player.attack += Math.max(1, (1 * player.level - 3));
        player.defense += Math.round(Math.max(1, (1 * player.level) / 8));
        log(`Level up! You are now level ${player.level}!`);
        log('Your stats have increased!');
        checkLevelUp();
    }
}

function log(message) {
    const gameLog = document.getElementById('game-log');
    gameLog.innerHTML += message + '<br>';
    gameLog.scrollTop = gameLog.scrollHeight;
}

function clearLog() {
    document.getElementById('game-log').innerHTML = '';
}

document.getElementById('attack-btn').onclick = attack;
document.getElementById('bravery-btn').onclick = bravery;
document.getElementById('defend-btn').onclick = defend;

let saveKey = 'roguelikeSave';

// Helper function to prepare player data for saving
function preparePlayerForSave(player) {
    return {
        ...player,
        inventory: Object.entries(player.inventory).reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {}),
        artifacts: player.artifacts.map(artifact => 
            Object.keys(artifacts).find(key => artifacts[key] === artifact)
        ),
        banishedArtifacts: player.banishedArtifacts.map(artifact => 
            Object.keys(artifacts).find(key => artifacts[key] === artifact)
        )
    };
}


// Updated saveGame function
function saveGame() {
    const saveData = {
        player: preparePlayerForSave(player),
        currentWave: currentWave,
        currentEnemies: currentEnemies,
        selectedEnemy: selectedEnemy,
        statMod: statMod,
        potionPrice: potionPrice,
        itemData: items
    };
    localStorage.setItem(saveKey, JSON.stringify(saveData));
    console.log('Saved data:', saveData); // For debugging
}

// Updated loadGame function
function loadGame() {
    const savedData = localStorage.getItem(saveKey);
    if (savedData) {
        const parsedData = JSON.parse(savedData);
        player = restorePlayerAfterLoad(parsedData.player);
        currentWave = parsedData.currentWave;
        currentEnemies = parsedData.currentEnemies;
        selectedEnemy = parsedData.selectedEnemy;
        statMod = parsedData.statMod;
        potionPrice = parsedData.potionPrice;
        items = parsedData.itemData;
        updateUI();
        console.log('Loaded player data:', player); // For debugging
    } else {
        log('No saved game found.');
    }
}

function autoSave() {
    saveGame();
    setTimeout(autoSave, 3000); // in ms
}

function initializeGame() {
    const savedData = localStorage.getItem(saveKey);
    if (savedData) {
        loadGame();
    } else {
        generateEnemies();
        log('The battle begins!');
        log(`Targeting ${currentEnemies[selectedEnemy].type}.`);
    }
    autoSave();
    updateUI();
}