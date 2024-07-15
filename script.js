// Import JSON data
let player, defaults, artifacts, translator, items, enemyTypes, permanent, areasData;

Promise.all([
    fetch('data/player.json').then(response => response.json()),
    fetch('data/artifacts.json').then(response => response.json()),
    fetch('data/translator.json').then(response => response.json()),
    fetch('data/items.json').then(response => response.json()),
    fetch('data/enemyTypes.json').then(response => response.json()),
    fetch('data/permanent.json').then(response => response.json()),
    fetch('data/areas.json').then(response => response.json()),
]).then(([playerData, artifactsData, translatorData, itemsData, enemyTypesData, permanentData, areasJson]) => {
    player = playerData;
    defaults = { ...playerData };
    artifacts = artifactsData;
    translator = translatorData;
    items = itemsData;
    enemyTypes = enemyTypesData;
    permanent = permanentData;
    areasData = areasJson; // Assign fetched areasJson to the global areasData variable

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
let currentArea = null;
let currentEnemies = [];
let selectedEnemy = null;
let statMod = 1;
let potionPrice = 10;

function generateEnemies() {
    const enemyCount = Math.min(Math.floor(1 + (currentWave / 8)), 6);
    currentEnemies = [];
    const enemyTypeCounts = {};

    // Find the current area based on the current wave
    for (const area in areasData) {
        if (currentWave >= areasData[area].startingWave && currentWave <= (areasData[area].endingWave || currentWave)) {
            currentArea = area;
            break;
        }
    }

    if (!currentArea) {
        console.error('No valid area found for current wave.');
        return;
    }

    // Determine if it's the final wave for the current area
    const isFinalWave = currentWave == areasData[currentArea].endingWave - 1;

    // Adjust enemy generation based on ending wave and area-specific enemies
    if (isFinalWave && areasData[currentArea].finalWave) {
        // Spawn specific enemies listed in finalWave for the area
        areasData[currentArea].finalWave.forEach(enemyType => {
            const formattedEnemyType = formatEnemyType(enemyType);

            if (!enemyTypeCounts[formattedEnemyType]) {
                enemyTypeCounts[formattedEnemyType] = 0;
            }
            enemyTypeCounts[formattedEnemyType]++;
            const count = enemyTypeCounts[formattedEnemyType];
            const uniqueType = count > 1 ? `${formattedEnemyType} ${String.fromCharCode(64 + count)}` : formattedEnemyType;

            currentEnemies.push(createEnemy(formattedEnemyType, uniqueType));
        });
    } else {
        // Generate enemies based on enemyCount and valid enemy types for the current area
        const validEnemyTypes = areasData[currentArea].enemies || [];

        for (let i = 0; i < enemyCount; i++) {
            let randomType = null;

            if (validEnemyTypes.length > 0) {
                randomType = validEnemyTypes[Math.floor(Math.random() * validEnemyTypes.length)];
                randomType = formatEnemyType(randomType);
            } else {
                console.error('No valid enemy types found for the current area.');
                return;
            }

            if (!enemyTypeCounts[randomType]) {
                enemyTypeCounts[randomType] = 0;
            }
            enemyTypeCounts[randomType]++;
            const count = enemyTypeCounts[randomType];
            const uniqueType = count > 1 ? `${randomType} ${String.fromCharCode(64 + count)}` : randomType;
            currentEnemies.push(createEnemy(randomType, uniqueType));
        }
    }

    selectedEnemy = 0;
}

function formatEnemyType(enemyType) {
    // Split the enemy type by spaces, capitalize each word, and join back with spaces
    return enemyType.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function createEnemy(baseType, uniqueType) {
    const baseStats = enemyTypes[baseType];

    // Check if baseStats is defined
    if (!baseStats) {
        console.error(`Enemy type '${baseType}' not found in enemyTypes.`);
        return null; // or handle the error appropriately
    }

    // Calculate stats based on baseStats and statMod
    const maxHealth = Math.round(baseStats.maxHealth * statMod);
    const health = Math.round(baseStats.health * statMod);
    const attack = Math.round(baseStats.attack * statMod);
    const defense = Math.round(baseStats.defense * statMod);
    const experience = Math.round(baseStats.experience * statMod);

    return {
        ...baseStats,
        maxHealth: maxHealth,
        health: health,
        attack: attack,
        defense: defense,
        experience: experience,
        type: uniqueType,
        tempDefense: 0,
        shattered: false,
        weakness: false,
        frozenCounter: 0,
    };
}


const goldIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stat-icon gold-icon"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`;
const swordIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stat-icon"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/></svg>`;
const shieldIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stat-icon"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
const heartIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stat-icon"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

let disableItemActions = true;

function updateUI() {
    applyStats2();
    const playerContainer = document.getElementById('player-container');
    const healthPercentage = (player.finalHealth / player.maxHealth) * 100;
    const expToNextLevel = Math.round(10 * Math.pow(player.level, 1.7));
    const xpPercentage = (player.experience / expToNextLevel) * 100;

    playerContainer.innerHTML = `
        <div class="player-stats">
            <div class="stat-row">
                <span>Level ${player.level}</span>
                <span>${goldIcon} ${player.gold}G</span>
            </div>
            <div class="stat-row">
                <div class="stat-container">${heartIcon} ${player.finalHealth}/${player.maxHealth}</div>
                <div class="stat-container">${swordIcon} ${player.attack} (+${player.tempAttack})</div>
                <div class="stat-container">${shieldIcon} ${player.defense} (+${player.tempDefense})</div>
            </div>
            <div class="progress-bar">
                <div class="progress-fill health-fill" style="width: ${healthPercentage}%;"></div>
            </div>
            <div class="stat-row">
                <span>XP: ${player.experience}/${expToNextLevel}</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill xp-fill" style="width: ${xpPercentage}%;"></div>
            </div>
        </div>
    `;

    document.getElementById('souls-counter').innerHTML = `Souls: ${permanent.souls}`;

    const enemyContainer = document.getElementById('enemy-container');
    enemyContainer.innerHTML = '';
    currentEnemies.forEach((enemy, index) => {
        const enemyElement = document.createElement('div');
        enemyElement.classList.add('enemy');
        if (selectedEnemy === index) {
            enemyElement.classList.add('selected');
        }
        if (!isPlayerTurn && index === currentActingEnemy) {
            enemyElement.classList.add('acting');
        }

        const healthPercentage = (enemy.health / enemy.maxHealth) * 100;

        // Remove suffix and convert to lowercase for icon path
        const baseEnemyType = enemy.type.replace(/\s+[A-Z]$/, '').toLowerCase();
        const enemyIconPath = `./assets/${baseEnemyType}.png`;
        const enemySprite = `
            <img src="${enemyIconPath}" 
                 onerror="this.onerror=null; this.src='/assets/placeholder.png';" 
                 alt="${enemy.type}" 
                 class="enemy-sprite"
            >
        `;

        enemyElement.innerHTML = `
            ${enemySprite}
            <div class="enemy-stats">
                <div class="stat-container">${swordIcon}${enemy.attack}</div>
                <div class="stat-container">${shieldIcon}${enemy.defense}</div>
            </div>
            <div class="health-bar">
                <div class="health-fill" style="width: ${healthPercentage}%;"></div>
            </div>
            <div class="stat-container">${heartIcon}${enemy.health}</div>
        `;
        enemyElement.onclick = () => selectEnemy(index);
        enemyContainer.appendChild(enemyElement);
    });

    const waveTitle = document.getElementById('wave-title');
    waveTitle.textContent = `Wave ${currentWave}`;

    for (const area in areasData) {
        if (currentWave >= areasData[area].startingWave && currentWave <= areasData[area].endingWave) {
            currentArea = area;
            break;
        }
    }

    if (currentArea) {
        const hexColor = areasData[currentArea].hex;
        const gameContainer = document.getElementById('game-container');
        gameContainer.style.backgroundColor = `#${hexColor}`;

        // Update specific area containers with slightly darker background color
        const darkerHexColor = darkenHexColor(hexColor);
        document.getElementById('shop').style.backgroundColor = `#${darkerHexColor}`;
        document.getElementById('inventory').style.backgroundColor = `#${darkerHexColor}`;
        document.getElementById('artifacts').style.backgroundColor = `#${darkerHexColor}`;
        document.getElementById('souls-shop').style.backgroundColor = `#${darkerHexColor}`;

         // Update .enemy.selected background color
         const selectedEnemies = document.querySelectorAll('.enemy.selected');
         selectedEnemies.forEach(enemy => {
             enemy.style.backgroundColor = `#${darkerHexColor}`;
         });
 
         // Update #game-log background color
         const gameLog = document.getElementById('game-log');
         gameLog.style.backgroundColor = `#${darkerHexColor}`;
    }

    updateArtifacts();
    updateInventory();
    updateShop();
    updateSoulsShop();
}

// Function to darken a hex color slightly
function darkenHexColor(hex) {
    const padZero = (str, len) => {
        len = len || 2;
        const zeros = new Array(len).join('0');
        return (zeros + str).slice(-len);
    };

    const darkenAmount = 20; // Adjust as needed

    // Convert hex to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Darken the RGB values
    const darkenedR = Math.max(0, r - darkenAmount);
    const darkenedG = Math.max(0, g - darkenAmount);
    const darkenedB = Math.max(0, b - darkenAmount);

    // Convert back to hex
    const darkenedHex = padZero(darkenedR.toString(16)) +
        padZero(darkenedG.toString(16)) +
        padZero(darkenedB.toString(16));

    return darkenedHex;
}


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

            const artifactDiv = document.createElement('div');
            artifactDiv.classList.add('artifact');

            artifactDiv.innerHTML = `
                <p><strong>${artifactKey}</strong><br>${addTooltip(description)}</p>
                <button onclick="discardArtifact(${index})">Discard</button>
                <button onclick="banishArtifact(${index})">Banish</button>
            `;

            artifactsContainer.appendChild(artifactDiv);

            // Enable or disable buttons based on disableItemActions toggle
            const discardButton = artifactDiv.querySelector('button:nth-of-type(1)');
            const banishButton = artifactDiv.querySelector('button:nth-of-type(2)');
            discardButton.disabled = disableItemActions;
            banishButton.disabled = disableItemActions;
        }).join('');
    }
}

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
        if (items[key] && player.shop[key].price !== undefined) { // Check if player.shop[key] exists
            const button = document.createElement('button');
            button.textContent = `Buy ${item.name} (${player.shop[key].price} gold)`;
            button.onclick = () => buyItem(key);
            shopItemsDiv.appendChild(button);
            console.log(`Added button for ${item.name} with price ${player.shop[key].price}`); // Debugging log

            // Enable or disable based on disableItemActions toggle
            button.disabled = disableItemActions;
        } else {
            console.warn(`Item ${key} does not exist in player shop or does not have a price`); // Debugging log
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

            // Enable or disable based on disableItemActions toggle
            button.disabled = disableItemActions;
        }
    }
}

function buyItem(itemKey) {
    const item = player.shop[itemKey];
    const item2 = items[itemKey]
    if (player.gold >= item.price) {
        player.gold -= item.price;
        player.inventory[itemKey] = (player.inventory[itemKey] || 0) + 1;
        item.price += item.priceUpdate || 0;
        log(`You bought a ${item2.name}`)
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

let isPlayerTurn = true;
let currentActingEnemy = null;

function disableAllButtons() {
    document.getElementById('attack-btn').disabled = true;
    document.getElementById('defend-btn').disabled = true;
    document.getElementById('bravery-btn').disabled = true;
}

function enableAllButtons() {
    document.getElementById('attack-btn').disabled = false;
    if (d == false) {
        document.getElementById('defend-btn').disabled = false;
    }
    if (b == false) {
        document.getElementById('bravery-btn').disabled = false;
    }
}

function startPlayerTurn() {
    isPlayerTurn = true;
    enableAllButtons();
    log("It's your turn!");
    updateUI();
}

function attack() {
    if (!isPlayerTurn) return;
    disableAllButtons();

    if (selectedEnemy === null) {
        log('Please select an enemy to attack.');
        enableAllButtons();
        return;
    }

    const enemy = currentEnemies[selectedEnemy];
    let damage = Math.max(0, (player.attack + player.tempAttack) - (enemy.defense + enemy.tempDefense));
    let critBonusText = "";

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

    if (player.midas) {
        damage *= 0.9
    }

    damage = Math.round(damage);

    var midasBonusText = ""
    if (player.midas) {
        midasBonusText = ` You also got ${Math.round(damage / 10)}G.`
        player.gold += Math.round(damage / 10);
    }

    if (player.vampiricHeal > 0) {
        const healAmount = Math.round(damage * player.vampiricHeal);
        player.finalHealth = Math.min(player.maxHealth, player.finalHealth + healAmount);
        log(`You healed for ${healAmount} HP from your Vampiric Amulet.`);
    }

    enemy.health -= damage;
    log(`You dealt ${damage} damage to the ${enemy.type}${critBonusText}.${midasBonusText}`);

    if (enemy.health <= 0) {
        permanent.souls += 1;
        log(`You defeated the ${enemy.type}!`);
        player.experience += Math.round(enemy.experience * player.finalExperience);
        player.gold += enemy.gold;
        log(`You gained ${Math.round(enemy.experience * player.finalExperience)} EXP and ${enemy.gold} gold!`);
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
        startEnemyTurn();
    }
}

var d = false;
function defend() {
    if (!isPlayerTurn) return;
    disableAllButtons();

    player.tempDefense = 1 + Math.round(player.defense / 5);
    document.getElementById('defend-btn').disabled = true;
    log('Nothing will best you! Increase your defense by 20% for the wave.');
    if (player.stoneIdol) {
        log('You get 6 stacks of Stone Skin from the Stone Idol.');
        player.stoneSkinStacks += 6;
    }
    d = true;
    updateUI();
    startEnemyTurn();

}

var b = false;
function bravery() {
    if (!isPlayerTurn) return;
    disableAllButtons();

    player.tempAttack = Math.round(player.attack / 2);
    player.tempCritChance += player.bonusCritChance;
    document.getElementById('bravery-btn').disabled = true;
    b = true
    log('Nothing will best you! Increase your attack by 50% for the wave.');

    updateUI();
    startEnemyTurn();
}

function startEnemyTurn() {
    disableAllButtons();
    isPlayerTurn = false;
    currentActingEnemy = 0;
    enemyAction();
}

function enemyAction() {
    if (currentActingEnemy >= currentEnemies.length) {
        startPlayerTurn();
        return;
    }

    const enemy = currentEnemies[currentActingEnemy];
    log(`${enemy.type} is taking its turn...`);
    updateUI(); // Highlight the current enemy

    setTimeout(() => {
        enemy.tempDefense = 0;  // Reset temporary defense
        if (enemy.frozenCounter > 0) {
            enemy.frozenCounter--;
            log(`${enemy.type} is frozen and cannot act!`);
            currentActingEnemy++;
            enemyAction();
            return;
        }

        if (player.wither > 0) {
            enemy.health -= Math.round(enemy.maxHealth * player.wither);
            log(`${enemy.type} withers for ${Math.round(enemy.maxHealth * player.wither)} damage.`);

            if (enemy.health <= 0) {
                log(`The ${enemy.type} withers away...`);
                player.experience += Math.round(enemy.experience * player.finalExperience);
                player.gold += enemy.gold;
                log(`You gained ${Math.round(enemy.experience * player.finalExperience)} EXP and ${enemy.gold} gold!`);
                checkLevelUp();
                currentEnemies = currentEnemies.filter(e => e !== enemy);
                if (currentEnemies.length === 0) {
                    nextWave();
                }
            }
        }

        if (player.age > 0) {
            enemy.attack *= (1 - player.age);
            enemy.attack = Math.floor(enemy.attack);
            enemy.defense *= (1 - player.age);
            enemy.defense = Math.floor(enemy.defense)
            log(`${enemy.type} ages, losing a small bit of combat prowess. It's stats have been lowered.`);
        }

        let damage;
        damage = Math.max(0, enemy.attack - (player.defense + player.tempDefense + player.stoneSkinStacks));

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
                if (currentEnemies.length === 0) {
                    nextWave();
                }
            }
        } else {
            player.finalHealth -= damage;
            log(`The ${enemy.type} dealt ${damage} damage to you.`);
        }

        if (player.finalHealth <= 0 && player.phoenixRevive) {
            player.finalHealth = 1;
            player.phoenixRevive = false;
            log("Your Phoenix Feather brought you back from the brink of death!");
            startPlayerTurn();
        } else if (player.finalHealth <= 0) {
            gameOver();
        } else {
            currentActingEnemy++;
            enemyAction();
        }
        updateUI();
    }, 500);
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


let nextWaveButton;
function nextWave() {
    disableItemActions = false;
    nextWaveButton = document.createElement('button');
    nextWaveButton.textContent = 'Next Wave';
    nextWaveButton.onclick = nextWaveFinal;
    document.getElementById('action-buttons').appendChild(nextWaveButton);
    updateUI();
}

function nextWaveFinal() {
    disableItemActions = true;
    if (nextWaveButton && nextWaveButton.parentNode) {
        nextWaveButton.parentNode.removeChild(nextWaveButton);
    }
    b = false;
    d = false;
    player.stoneSkinStacks = 0;
    player.tempAttack = 0;
    player.tempCritChance = 0;
    // Check if player has the phoenix feather artifact and it is false, then set it to true
    const phoenixArtifact = player.artifacts.find(artifact => artifact === artifacts.phoenixFeather);
    if (phoenixArtifact && !player.phoenixRevive) {
        player.phoenixRevive = true;
        log("Your Phoenix Feather artifact is ready to revive you once more!");
    }
    document.getElementById('bravery-btn').disabled = false;
    player.tempDefense = 0;
    document.getElementById('defend-btn').disabled = false;
    statMod = parseFloat((statMod * 1.03).toFixed(2));
    log(`Wave ${currentWave} begins! Enemy stats increased by 3%.`);
    clearLog();
    generateEnemies();
    log(`Targeting ${currentEnemies[selectedEnemy].type}.`);
    if (currentWave % 5 === 0) {
        acquireArtifact();
    }
    currentWave++;
    startPlayerTurn();
    updateUI();
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
    player.artifacts = [];
    player.shop = {
        "potion": {
            "price": 5,
            "priceUpdate": 5
        },
        "whetstone": {
            "price": 50,
            "priceUpdate": 10
        },
        "shredOfWisdom": {
            "price": 50,
            "priceUpdate": 25
        },
        "tankBrew": {
            "price": 40,
            "priceUpdate": 10
        }
    }  
    player.inventory = [];
    currentWave = 1;
    currentEnemies = [];
    selectedEnemy = null;
    statMod = 1;
    potionPrice = 10;
    generateEnemies();
    updateUI();
    applyStats();
    saveGame(1);
    refresh();
}

function refresh() {
    location.reload();
}

function checkLevelUp() {
    const expToNextLevel = Math.round(10 * Math.pow(player.level, 1.7));
    if (player.experience >= expToNextLevel) {
        player.level++;
        player.experience -= expToNextLevel
        player.maxHealth += 2 * player.level;
        player.finalHealth += 2 * player.level;
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

let saveKey = 'player';
let saveKey2 = 'perma'

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


let saving = false; // Global variable to track saving state
let savePriority = 0; // Global variable to track save priority

function saveGame(priority = 0) {
    // Check if the current save priority is higher than the one being requested
    if (saving && priority < savePriority) {
        console.log('Higher priority save requested. Cancelling current save.');
        return;
    }

    saving = true;
    savePriority = priority;

    const saveData = {
        player: preparePlayerForSave(player),
        currentWave: currentWave,
        currentEnemies: currentEnemies,
        selectedEnemy: selectedEnemy,
        statMod: statMod,
        potionPrice: potionPrice
    };

    const permaData = {
        permanent: permanent
    };

    localStorage.setItem(saveKey, JSON.stringify(saveData));
    localStorage.setItem(saveKey2, JSON.stringify(permaData));

    saving = false;
    console.log('Saved data:', saveData); // For debugging
}



// Updated loadGame function
function loadGame() {
    const savedData = localStorage.getItem(saveKey);
    const savedData2 = localStorage.getItem(saveKey2);
    if (savedData) {
        const parsedData = JSON.parse(savedData);
        player = restorePlayerAfterLoad(parsedData.player);
        currentWave = parsedData.currentWave;
        currentEnemies = parsedData.currentEnemies;
        selectedEnemy = parsedData.selectedEnemy;
        statMod = parsedData.statMod;
        potionPrice = parsedData.potionPrice;
        log('A previous game has been loaded.');
        console.log('Loaded player data:', player); // For debugging

        if (currentEnemies.length == 0) {
            nextWave();
        }
    } else {
        log('No saved game found.');
    }

    if (savedData2) {
        const parsed = JSON.parse(savedData2);
        permanent = parsed.permanent;
        log(`Soul data loaded.`)
    }
    updateUI();
}

function autoSave() {
    saveGame(0);
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

function updateSoulsShop() {
    const soulsItemsContainer = document.getElementById('souls-items');
    soulsItemsContainer.innerHTML = '';

    for (const [upgradeKey, upgradeInfo] of Object.entries(permanent.upgrades)) {
        const button = document.createElement('button');
        const currentValue = permanent[upgradeKey] || 0;
        const isAtCap = currentValue >= upgradeInfo.cap;

        button.innerHTML = `
            ${formatUpgradeName(upgradeKey)}: ${currentValue}/${upgradeInfo.cap}<br>
            +${upgradeInfo.amount} for ${upgradeInfo.price} souls
        `;
        button.disabled = isAtCap || permanent.souls < upgradeInfo.price;
        button.onclick = () => purchaseUpgrade(upgradeKey);

        soulsItemsContainer.appendChild(button);
    }

    // Update souls counter
    document.getElementById('souls-counter').textContent = `Souls: ${permanent.souls}`;
}

function formatUpgradeName(key) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

function purchaseUpgrade(upgradeKey) {
    const upgrade = permanent.upgrades[upgradeKey];
    if (permanent.souls >= upgrade.price) {
        permanent.souls -= upgrade.price;
        permanent[upgradeKey] = (permanent[upgradeKey] || 0) + upgrade.amount;

        // Check if we need to cap the upgrade
        if (permanent[upgradeKey] > upgrade.cap) {
            permanent[upgradeKey] = upgrade.cap;
        }

        // Update the UI
        updateUI();
        saveGame(2);
    }
}

function applyStats() {
    player.maxHealth += permanent.bonusHealth || 0;
    player.finalHealth = player.health + (permanent.bonusHealth || 0);
    applyStats2();
}

function applyStats2() {
    player.finalExperience = (player.baseExperienceMultiplier + (permanent.bonusExperience || 0) + (player.bonusExperience2 || 0))
}
